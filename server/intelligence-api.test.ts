import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerIntelligenceRoutes, createReadLimiter } from "./intelligence-api";
import { createIntelligenceService, type FusionEngine } from "./intelligence-service";
import type { Analysis } from "../shared/fusion";
const fixture: Analysis = { generated_at_utc: "2026-11-12T19:00:00Z", catalog_version: "test", catalog_release_date: "2026-11-12", catalog_entry_count: 0, severity_counts: { Critical: 0, High: 0, Anomaly: 0, Medium: 0, Low: 0 }, recent_kev: [], ics_advisories: [], official_ic3_items: [], source_status: [{ name: "CISA KEV", url: "https://www.cisa.gov/", status: "ok", retrieved_at: "2026-11-12T19:00:00Z" }] };
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); });
async function setup(fail = false, degraded = false) {
  const collect = vi.fn().mockImplementation(async () => { if (fail) throw new Error("offline"); return { ...fixture, source_status: degraded ? [...fixture.source_status, { name: "IC3", url: "https://www.ic3.gov", status: "error", retrieved_at: fixture.generated_at_utc }] : fixture.source_status }; });
  const core: FusionEngine = { collectIntelligence: collect, buildReport: (_, { turn }) => `# Preview ${turn}`, buildSocialDrafts: () => ({ LinkedIn: "draft" }) };
  const app = express(); registerIntelligenceRoutes(app, createIntelligenceService(async () => core));
  const server = createServer(app); servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  return { url, collect };
}
describe("public REST surface", () => {
  it("shares collection cache across snapshot and digest and supports CORS", async () => {
    const { url, collect } = await setup();
    const current = await fetch(`${url}/api/v1/intelligence`); expect(current.status).toBe(200); expect(current.headers.get("access-control-allow-origin")).toBe("*");
    expect((await current.json()).analysis.catalog_version).toBe("test");
    const preview = await fetch(`${url}/api/v1/digest?turn=2`); expect(preview.status).toBe(200); expect(await preview.json()).toMatchObject({ turn: 2, mode: "local_preview", archive_written: false, markdown: expect.stringContaining("# Preview 2") }); expect(collect).toHaveBeenCalledTimes(1);
  });
  it("returns explicit degraded metadata", async () => { const { url } = await setup(false, true); expect(await (await fetch(`${url}/api/v1/intelligence`)).json()).toMatchObject({ collection_status: "degraded" }); });
  it("returns normal JSON 503 on unavailable sources", async () => { const { url } = await setup(true); const res = await fetch(`${url}/api/v1/intelligence`); expect(res.status).toBe(503); expect(await res.json()).toMatchObject({ error: { code: "SOURCE_UNAVAILABLE" } }); });
  it.each(["0", "-1", "1.5", "1000000", "foo", "1&turn=2", "01"])('validates turn=%s', async turn => { const { url, collect } = await setup(); const res = await fetch(`${url}/api/v1/digest?turn=${turn}`); expect(res.status).toBe(400); expect(await res.json()).toMatchObject({ error: { code: "INVALID_TURN" } }); expect(collect).not.toHaveBeenCalled(); });
  it("defaults to turn 1 and documents the actual paths", async () => {
    const { url } = await setup(); expect((await (await fetch(`${url}/api/v1/digest`)).json()).turn).toBe(1);
    const doc = await (await fetch(`${url}/api/v1/openapi.json`)).json(); expect(doc.openapi).toBe("3.1.0"); expect(Object.keys(doc.paths).sort()).toEqual(["/api/v1/digest", "/api/v1/health", "/api/v1/intelligence", "/api/v1/openapi.json"].sort()); expect(doc.servers[0].url).toBe("/");
  });
  it("health does not fetch upstream and writes are rejected", async () => {
    const { url, collect } = await setup(); expect(await (await fetch(`${url}/api/v1/health`)).json()).toMatchObject({ status: "ok", mode: "read_only", collection: "not_collected" }); expect(collect).not.toHaveBeenCalled();
    const post = await fetch(`${url}/api/v1/digest`, { method: "POST" }); expect(post.status).toBe(405); expect(await post.json()).toMatchObject({ error: { code: "READ_ONLY" } });
    expect((await fetch(`${url}/api/v1/not-a-route`)).status).toBe(404); expect((await fetch(`${url}/api/v1/digest`, { method: "OPTIONS" })).status).toBe(204);
  });
  it("bounds request rates and resets after the window", () => {
    let time = 0; const limiter = createReadLimiter(2, 1000, () => time); const next = vi.fn(); const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any; const req = { ip: "127.0.0.1", socket: {} } as any;
    limiter(req, res, next); limiter(req, res, next); limiter(req, res, next); expect(next).toHaveBeenCalledTimes(2); expect(res.status).toHaveBeenCalledWith(429); expect(res.setHeader).toHaveBeenCalledWith("Retry-After", 1);
    time = 1000; limiter(req, res, next); expect(next).toHaveBeenCalledTimes(3);
  });
});
