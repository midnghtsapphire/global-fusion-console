import type { TRPCLink } from "@trpc/client";
import { TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../../server/routers";
import type { Digest, Snapshot } from "@shared/fusion";

export function resolveStaticOperation(path: string, input: unknown, snapshot: Snapshot, digest: Digest) {
  if (path === "intelligence.snapshot") return snapshot;
  if (path === "intelligence.render") {
    const turn = (input as { turn?: number } | undefined)?.turn ?? 1;
    if (turn !== digest.turn) throw new Error("This static deployment contains preview turn 1 only. Rebuild the snapshot or use the fullstack runtime for other turns.");
    return digest;
  }
  throw new Error("This public snapshot supports intelligence reads only.");
}
export const staticSnapshotLink: TRPCLink<AppRouter> = () => {
  let collection: Promise<[Snapshot, Digest]> | undefined;
  const files = import.meta.glob("../generated/*.json", { import: "default" });
  const load = () => collection ??= (async () => {
    const snapshot = files["../generated/snapshot.json"];
    const digest = files["../generated/digest.json"];
    if (!snapshot || !digest) throw new Error("The build snapshot is unavailable. Rebuild this Pages deployment.");
    return Promise.all([snapshot(), digest()]) as Promise<[Snapshot, Digest]>;
  })();
  return ({ op }) => observable(observer => {
    let disposed = false;
    if (op.type !== "query") { observer.error(new TRPCClientError("This public snapshot is read-only.")); return; }
    load().then(([snapshot, digest]) => {
      if (disposed) return;
      try { observer.next({ result: { data: resolveStaticOperation(op.path, op.input, snapshot, digest) } }); observer.complete(); }
      catch (error) { observer.error(TRPCClientError.from(error as Error)); }
    }).catch(error => { if (!disposed) observer.error(TRPCClientError.from(error)); });
    return () => { disposed = true; };
  });
};
