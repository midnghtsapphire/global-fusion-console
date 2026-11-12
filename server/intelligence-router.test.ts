import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ snapshot: vi.fn(), render: vi.fn() }));
vi.mock("./intelligence-service", () => ({ intelligenceService: mocked, MAX_TURN: 999999 }));
import { intelligenceRouter } from "./intelligence-router";
import type { TrpcContext } from "./_core/context";
const context = { user: null, req: { headers: {} }, res: {} } as TrpcContext;
beforeEach(() => { mocked.snapshot.mockReset(); mocked.render.mockReset(); });
describe("anonymous intelligence tRPC queries", () => {
  it("reads public intelligence without an account", async () => { mocked.snapshot.mockResolvedValue({ collection_status: "ready" }); expect(await intelligenceRouter.createCaller(context).snapshot()).toEqual({ collection_status: "ready" }); });
  it("preserves degraded source metadata", async () => { mocked.snapshot.mockResolvedValue({ collection_status: "degraded", warning: "Source incomplete" }); expect(await intelligenceRouter.createCaller(context).snapshot()).toMatchObject({ collection_status: "degraded", warning: "Source incomplete" }); });
  it("returns service unavailable without leaking internal errors", async () => { mocked.snapshot.mockRejectedValue(new Error("internal private stack")); await expect(intelligenceRouter.createCaller(context).snapshot()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "Official intelligence sources are temporarily unavailable. Please retry shortly." }); });
  it("defaults preview turn to one", async () => { mocked.render.mockResolvedValue({ archive_written: false }); await intelligenceRouter.createCaller(context).render(); expect(mocked.render).toHaveBeenCalledWith(1); });
  it.each([0, -1, 1.5, 1000000])("rejects invalid turn %s", async turn => { await expect(intelligenceRouter.createCaller(context).render({ turn })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(mocked.render).not.toHaveBeenCalled(); });
  it("accepts maximum turn", async () => { mocked.render.mockResolvedValue({ turn: 999999 }); expect(await intelligenceRouter.createCaller(context).render({ turn: 999999 })).toMatchObject({ turn: 999999 }); });
});
