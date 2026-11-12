import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { intelligenceService } from "../server/intelligence-service";
import { createOpenApi } from "../server/intelligence-openapi";

const root = resolve(import.meta.dirname, "..");
console.log("Collecting official sources for a timestamped static snapshot…");
const digest = await intelligenceService.render(1);
const snapshot = { analysis: digest.analysis, collection_status: digest.collection_status, cache: { ttl_seconds: 0, expires_at_utc: digest.analysis.generated_at_utc, stale: false }, ...(digest.warning ? { warning: digest.warning } : {}) };
const staticDigest = { ...digest, ...snapshot };
const generated = resolve(root, "client/src/generated");
const publicSnapshot = resolve(root, "client/public/snapshot");
await mkdir(generated, { recursive: true });
await mkdir(publicSnapshot, { recursive: true });
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
await Promise.all([
  writeFile(resolve(generated, "snapshot.json"), json(snapshot)),
  writeFile(resolve(generated, "digest.json"), json(staticDigest)),
  writeFile(resolve(publicSnapshot, "intelligence.json"), json(snapshot)),
  writeFile(resolve(publicSnapshot, "digest.json"), json(staticDigest)),
  writeFile(resolve(publicSnapshot, "report.md"), staticDigest.markdown),
  writeFile(resolve(publicSnapshot, "social-drafts.json"), json(staticDigest.social_drafts)),
  writeFile(resolve(publicSnapshot, "manifest.json"), json({ mode: "build_snapshot", generated_at_utc: digest.analysis.generated_at_utc, collection_status: digest.collection_status, realtime: false, refresh: "Run the manual Pages workflow or rebuild with pnpm build:pages.", turn: 1, archive_written: false, endpoints: ["intelligence.json", "digest.json", "report.md", "social-drafts.json"], api_note: "These are static files, not realtime REST endpoints. The fullstack runtime exposes /api/v1/intelligence, /api/v1/digest, /api/v1/health and /api/v1/openapi.json." })),
  writeFile(resolve(publicSnapshot, "fullstack-openapi.json"), json({ ...createOpenApi("/"), "x-deployment-note": "Reference for the fullstack runtime only. GitHub Pages does not serve these live API routes." })),
]);
console.log(`Snapshot generated ${digest.analysis.generated_at_utc}: ${digest.analysis.catalog_entry_count} catalog entries, ${digest.analysis.recent_kev.length} selected, ${digest.social_drafts.length} social drafts. Collection: ${digest.collection_status}. No archive written.`);
