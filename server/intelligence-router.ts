import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { intelligenceService, MAX_TURN } from "./intelligence-service";

const turnInput = z.object({ turn: z.number().int().min(1).max(MAX_TURN).default(1) }).default({ turn: 1 });
async function available<T>(request: () => Promise<T>) {
  try { return await request(); }
  catch { throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Official intelligence sources are temporarily unavailable. Please retry shortly." }); }
}
export const intelligenceRouter = router({
  snapshot: publicProcedure.query(() => available(() => intelligenceService.snapshot())),
  render: publicProcedure.input(turnInput).query(({ input }) => available(() => intelligenceService.render(input.turn))),
});
