import { describe, expect, it } from "vitest";
import { resolveStaticOperation } from "../client/src/lib/static-link";
import type { Snapshot, Digest } from "../shared/fusion";
const snapshot = { analysis: { generated_at_utc: "2026-11-12T19:00:00Z" }, collection_status: "degraded", cache: { ttl_seconds: 0, expires_at_utc: "2026-11-12T19:00:00Z", stale: false } } as Snapshot;
const digest = { ...snapshot, turn: 1, mode: "local_preview", archive_written: false, markdown: "# Real snapshot", social_drafts: [] } as Digest;
describe("Pages snapshot transport", () => {
  it("preserves fixed snapshot timestamp and degraded coverage", () => { expect(resolveStaticOperation("intelligence.snapshot", undefined, snapshot, digest)).toBe(snapshot); expect(snapshot.cache.ttl_seconds).toBe(0); });
  it("serves only the bundled turn-one preview", () => { expect(resolveStaticOperation("intelligence.render", { turn: 1 }, snapshot, digest)).toBe(digest); expect(resolveStaticOperation("intelligence.render", undefined, snapshot, digest)).toBe(digest); });
  it("does not pretend to generate arbitrary turns", () => { expect(() => resolveStaticOperation("intelligence.render", { turn: 2 }, snapshot, digest)).toThrow("preview turn 1 only"); });
  it("rejects accounts, posting and unsupported operations", () => { expect(() => resolveStaticOperation("auth.me", undefined, snapshot, digest)).toThrow("intelligence reads only"); expect(() => resolveStaticOperation("intelligence.publish", {}, snapshot, digest)).toThrow(); });
});
