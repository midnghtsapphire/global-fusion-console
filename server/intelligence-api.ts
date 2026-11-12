import type { Express, Request, Response, NextFunction } from "express";
import { intelligenceService, MAX_TURN } from "./intelligence-service";
import { createOpenApi } from "./intelligence-openapi";

type Service = typeof intelligenceService;
export function createReadLimiter(max = 60, windowMs = 60000, now = Date.now) {
  const clients = new Map<string, { count: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const time = now();
    if (clients.size >= 10000) clients.forEach((state, ip) => { if (state.reset <= time) clients.delete(ip); });
    let state = clients.get(key);
    if (!state || state.reset <= time) {
      if (!state && clients.size >= 10000) return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Request capacity reached. Please retry shortly." } });
      state = { count: 0, reset: time + windowMs }; clients.set(key, state);
    }
    if (++state.count > max) { res.setHeader("Retry-After", Math.max(1, Math.ceil((state.reset - time) / 1000))); return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Read limit exceeded. Please retry shortly." } }); }
    next();
  };
}
export function registerIntelligenceRoutes(app: Express, service: Service = intelligenceService) {
  app.use("/api/v1", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    if (!["GET", "HEAD"].includes(req.method)) { res.setHeader("Allow", "GET, HEAD, OPTIONS"); res.status(405).json({ error: { code: "READ_ONLY", message: "This public API supports read-only requests." } }); return; }
    next();
  }, createReadLimiter());
  const failed = (res: Response) => res.status(503).json({ error: { code: "SOURCE_UNAVAILABLE", message: "Official intelligence sources are temporarily unavailable. Please retry shortly." } });
  app.get("/api/v1/health", (_req, res) => res.json(service.health()));
  app.get("/api/v1/openapi.json", (req, res) => {
    // Relative server URL resolves against the actual serving origin; never trust client Host values.
    res.json(createOpenApi("/"));
  });
  app.get("/api/v1/intelligence", async (_req, res) => {
    try { res.json(await service.snapshot()); } catch { failed(res); }
  });
  app.get("/api/v1/digest", async (req, res) => {
    const raw = req.query.turn ?? "1";
    if (typeof raw !== "string" || !/^[1-9]\d{0,5}$/.test(raw) || Number(raw) > MAX_TURN) {
      res.status(400).json({ error: { code: "INVALID_TURN", message: `turn must be an integer from 1 to ${MAX_TURN}.` } }); return;
    }
    try { res.json(await service.render(Number(raw))); } catch { failed(res); }
  });
  app.use("/api/v1", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Unknown API endpoint. See /api/v1/openapi.json." } }));
}
