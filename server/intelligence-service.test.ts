import { describe, expect, it, vi } from "vitest";
import { createIntelligenceService, CACHE_TTL_MS, FAILURE_BACKOFF_MS, MAX_STALE_MS, MAX_TURN, type FusionEngine } from "./intelligence-service";
import type { Analysis } from "../shared/fusion";
export function analysisFixture(): Analysis {
  return { generated_at_utc: "2026-11-12T19:00:00.000Z", catalog_version: "test", catalog_release_date: "2026-11-12", catalog_entry_count: 1, severity_counts: { Critical: 1, High: 0, Anomaly: 0, Medium: 0, Low: 0 }, recent_kev: [{ cve: "CVE-2026-12345", vendor: "Test vendor", product: "Test product", name: "Test remote code execution", date_added: "2026-11-12", due_date: "2026-12-01", description: "Test fixture only", required_action: "Apply the vendor mitigation", operational_priority: "Critical", priority_rationale: "Test rationale", source: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog" }], ics_advisories: [], official_ic3_items: [], source_status: [{ name: "CISA KEV", url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", status: "ok", retrieved_at: "2026-11-12T19:00:00.000Z" }] };
}
function engine(collect = vi.fn().mockResolvedValue(analysisFixture())): FusionEngine {
  return { collectIntelligence: collect, buildReport: vi.fn((_, { turn }) => `# Turn ${turn}`), buildSocialDrafts: vi.fn(() => Object.fromEntries(["LinkedIn", "Facebook", "Instagram", "TikTok", "Lemon8", "Reddit"].map(p => [p, `${p} draft — not published`])) ) };
}
describe("shared read-only intelligence service", () => {
  it("deduplicates concurrent collections and caches ten minutes", async () => {
    let time = 1000; const core = engine();
    const service = createIntelligenceService(async () => core, () => time);
    const responses = await Promise.all([service.snapshot(), service.snapshot(), service.render(1)]);
    expect(core.collectIntelligence).toHaveBeenCalledTimes(1);
    expect(core.collectIntelligence).toHaveBeenCalledWith({ limit: 12, advisoryLimit: 3 });
    expect(responses[0].analysis).toBe(responses[1].analysis);
    expect(responses[0].cache.ttl_seconds).toBe(600);
    time += CACHE_TTL_MS - 1; await service.snapshot(); expect(core.collectIntelligence).toHaveBeenCalledTimes(1);
    time += 1; await service.snapshot(); expect(core.collectIntelligence).toHaveBeenCalledTimes(2);
  });
  it("preserves optional-source failures without fabricating items", async () => {
    const fixture = analysisFixture(); fixture.source_status.push({ name: "FBI IC3", url: "https://www.ic3.gov/PSA", status: "error", retrieved_at: fixture.generated_at_utc, error: "Timeout" });
    const service = createIntelligenceService(async () => engine(vi.fn().mockResolvedValue(fixture)));
    const current = await service.snapshot(); expect(current.collection_status).toBe("degraded"); expect(current.warning).toContain("incomplete"); expect(current.analysis.official_ic3_items).toEqual([]); expect(current.analysis.source_status[1].error).toBe("Timeout");
  });
  it("fails honestly on initial error and backs off repeated requests", async () => {
    let time = 0; const core = engine(vi.fn().mockRejectedValue(new Error("upstream failed")));
    const service = createIntelligenceService(async () => core, () => time);
    await expect(service.snapshot()).rejects.toThrow("temporarily unavailable");
    await expect(service.snapshot()).rejects.toThrow("temporarily unavailable"); expect(core.collectIntelligence).toHaveBeenCalledTimes(1);
    time += FAILURE_BACKOFF_MS; await expect(service.snapshot()).rejects.toThrow(); expect(core.collectIntelligence).toHaveBeenCalledTimes(2);
  });
  it("shows explicitly stale cache on refresh failure, then refuses overly old data", async () => {
    let time = 0; const collect = vi.fn().mockResolvedValueOnce(analysisFixture()).mockRejectedValue(new Error("offline"));
    const service = createIntelligenceService(async () => engine(collect), () => time);
    await service.snapshot(); time += CACHE_TTL_MS;
    const stale = await service.snapshot(); expect(stale.collection_status).toBe("stale"); expect(stale.cache.stale).toBe(true); expect(stale.warning).toContain("Refresh failed");
    time = MAX_STALE_MS + 1; await expect(service.snapshot()).rejects.toThrow();
  });
  it("rejects collections with no healthy source", async () => {
    const fixture = analysisFixture(); fixture.source_status[0].status = "error";
    const service = createIntelligenceService(async () => engine(vi.fn().mockResolvedValue(fixture)));
    await expect(service.snapshot()).rejects.toThrow();
  });
  it("renders nonpersistent previews and six unaltered draft strings", async () => {
    const core = engine(); const service = createIntelligenceService(async () => core);
    const preview = await service.render(); expect(preview.turn).toBe(1); expect(preview.mode).toBe("local_preview"); expect(preview.archive_written).toBe(false); expect(preview.social_drafts).toHaveLength(6); expect(preview.social_drafts[0]).toEqual({ platform: "LinkedIn", text: "LinkedIn draft — not published" });
    expect(core.buildReport).toHaveBeenCalledWith(preview.analysis, { turn: 1 });
  });
  it.each([0, -1, 1.5, NaN, Infinity, MAX_TURN + 1])("rejects invalid preview turn %s before fetching", async turn => {
    const core = engine(); const service = createIntelligenceService(async () => core);
    await expect(service.render(turn)).rejects.toThrow(RangeError); expect(core.collectIntelligence).not.toHaveBeenCalled();
  });
  it("accepts maximum preview turn and exposes liveness without collection", async () => {
    const core = engine(); const service = createIntelligenceService(async () => core);
    expect(service.health().collection).toBe("not_collected"); expect(core.collectIntelligence).not.toHaveBeenCalled();
    expect((await service.render(MAX_TURN)).turn).toBe(MAX_TURN);
  });
});
