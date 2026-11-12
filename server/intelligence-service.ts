import { sourceIsHealthy, type Analysis, type Digest, type Snapshot, type SocialDraft } from "../shared/fusion";

export const CACHE_TTL_MS = 10 * 60 * 1000;
export const MAX_STALE_MS = 60 * 60 * 1000;
export const FAILURE_BACKOFF_MS = 30 * 1000;
export const MAX_TURN = 999999;
export class IntelligenceUnavailable extends Error {
  constructor() { super("Official intelligence sources are temporarily unavailable. Please retry shortly."); }
}
export interface FusionEngine {
  collectIntelligence(options: { limit: number; advisoryLimit: number }): Promise<Analysis>;
  buildReport(analysis: Analysis, options: { turn: number }): string;
  buildSocialDrafts(analysis: Analysis, options: { turn: number }): unknown;
}

// Normalizes the engine's draft transport, not its analysis or classification logic.
function normalizeDrafts(value: unknown): SocialDraft[] {
  if (Array.isArray(value)) return value.map((draft: any) => ({ platform: String(draft.platform), text: String(draft.text ?? draft.content ?? "") }));
  if (value && typeof value === "object") return Object.entries(value).map(([platform, text]) => ({ platform, text: typeof text === "string" ? text : String((text as any)?.text ?? (text as any)?.content ?? "") }));
  throw new Error("Engine returned an invalid draft format");
}

export function createIntelligenceService(loadEngine: () => Promise<FusionEngine>, now = Date.now) {
  let cached: { analysis: Analysis; expires: number; collected: number } | undefined;
  let inFlight: Promise<Snapshot> | undefined;
  let retryAfter = 0;
  function packageSnapshot(stale = false): Snapshot {
    if (!cached) throw new IntelligenceUnavailable();
    const degraded = cached.analysis.source_status.some(s => !sourceIsHealthy(s.status));
    return {
      analysis: cached.analysis,
      collection_status: stale ? "stale" : degraded ? "degraded" : "ready",
      cache: { ttl_seconds: CACHE_TTL_MS / 1000, expires_at_utc: new Date(cached.expires).toISOString(), stale },
      ...(stale ? { warning: "Refresh failed. Showing a previous collection; check source timestamps before acting." } : degraded ? { warning: "Some official sources could not be retrieved. This collection is incomplete." } : {}),
    };
  }
  function staleOrThrow(): Snapshot {
    if (cached && now() - cached.collected <= MAX_STALE_MS) return packageSnapshot(true);
    throw new IntelligenceUnavailable();
  }
  async function snapshot(): Promise<Snapshot> {
    if (cached && cached.expires > now()) return packageSnapshot();
    if (inFlight) return inFlight;
    if (now() < retryAfter) return staleOrThrow();
    inFlight = (async () => {
      try {
        const engine = await loadEngine();
        const analysis = await engine.collectIntelligence({ limit: 12, advisoryLimit: 3 });
        if (!analysis.source_status?.some(s => sourceIsHealthy(s.status))) throw new IntelligenceUnavailable();
        cached = { analysis, expires: now() + CACHE_TTL_MS, collected: now() };
        retryAfter = 0;
        return packageSnapshot();
      } catch {
        retryAfter = now() + FAILURE_BACKOFF_MS;
        return staleOrThrow();
      } finally { inFlight = undefined; }
    })();
    return inFlight;
  }
  async function render(turn = 1): Promise<Digest> {
    if (!Number.isSafeInteger(turn) || turn < 1 || turn > MAX_TURN) throw new RangeError(`turn must be an integer from 1 to ${MAX_TURN}`);
    const current = await snapshot();
    const engine = await loadEngine();
    const notice = "> LOCAL PREVIEW ONLY — No archive is written. This preview does not advance or modify Audrey’s archived TURN002. Social content is unpublished.\n\n";
    return { ...current, turn, mode: "local_preview", archive_written: false, markdown: notice + engine.buildReport(current.analysis, { turn }), social_drafts: normalizeDrafts(engine.buildSocialDrafts(current.analysis, { turn })) };
  }
  function health() {
    return { status: "ok", mode: "read_only", cache_ttl_seconds: CACHE_TTL_MS / 1000, collection: !cached ? "not_collected" : cached.expires > now() ? "cached" : "expired", collection_in_flight: Boolean(inFlight), last_collected_at_utc: cached ? new Date(cached.collected).toISOString() : null };
  }
  return { snapshot, render, health };
}

// The copied engine is bundled with the app; no production filesystem archive is used.
let enginePromise: Promise<FusionEngine> | undefined;
async function loadEngine(): Promise<FusionEngine> {
  enginePromise ??= import("./fusion-core/index.mjs") as Promise<FusionEngine>;
  return enginePromise;
}
export const intelligenceService = createIntelligenceService(loadEngine);
