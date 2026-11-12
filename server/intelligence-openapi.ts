const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const str = { type: "string" };
const date = { type: "string", format: "date-time" };
const props = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required });
const array = (items: unknown) => ({ type: "array", items });
const response = (description: string, schema: unknown) => ({ description, content: { "application/json": { schema } } });
export function createOpenApi(server = "/") {
  const failures = { "429": response("Read rate limit reached (60 requests per minute per instance/client).", ref("Error")), "503": response("Official intelligence sources unavailable and no usable cached collection.", ref("Error")) };
  return {
    openapi: "3.1.0", info: { title: "Global Fusion public read-only API", version: "1.0.0", description: "Official-source intelligence cached in memory for 10 minutes per server instance with in-flight deduplication. Requests never write an archive or publish content. A stale collection (maximum one hour old) may be returned with explicit stale metadata when refresh fails. Turn defaults to 1; previews are separate from Audrey archive TURN002." },
    servers: [{ url: server }],
    paths: {
      "/api/v1/intelligence": { get: { operationId: "getIntelligence", summary: "Read the shared current intelligence collection", responses: { "200": response("Current, degraded or explicitly stale collection.", ref("Snapshot")), ...failures } } },
      "/api/v1/digest": { get: { operationId: "getDigest", summary: "Generate a nonpersistent local preview", parameters: [{ name: "turn", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 999999, default: 1 } }], responses: { "200": response("Report Markdown and six social drafts with archive_written=false.", ref("Digest")), "400": response("Invalid turn.", ref("Error")), ...failures } } },
      "/api/v1/health": { get: { operationId: "getHealth", summary: "Check service liveness without collecting intelligence", responses: { "200": response("Service liveness; does not guarantee upstream availability.", ref("Health")), "429": failures["429"] } } },
      "/api/v1/openapi.json": { get: { operationId: "getOpenApi", summary: "Read this OpenAPI document", responses: { "200": response("OpenAPI 3.1 document", { type: "object" }), "429": failures["429"] } } },
    },
    components: { schemas: {
      Error: props({ error: props({ code: str, message: str }) }),
      SourceStatus: props({ name: str, url: { type: "string", format: "uri" }, status: str, retrieved_at: date, error: str }, ["name", "url", "status", "retrieved_at"]),
      KevItem: props({ cve: str, vendor: str, product: str, name: str, date_added: str, due_date: str, description: str, required_action: str, operational_priority: { type: "string", enum: ["Critical", "High", "Anomaly", "Medium", "Low"] }, priority_rationale: str, source: str }),
      Advisory: props({ title: str, date: str, source: str, summary: str, severity: str, cves: array(str) }),
      Analysis: props({ generated_at_utc: date, catalog_version: str, catalog_release_date: str, catalog_entry_count: { type: "integer" }, severity_counts: props(Object.fromEntries(["Critical", "High", "Anomaly", "Medium", "Low"].map(p => [p, { type: "integer" }]))), recent_kev: array(ref("KevItem")), ics_advisories: array(ref("Advisory")), official_ic3_items: array(ref("Advisory")), source_status: array(ref("SourceStatus")) }),
      Cache: props({ ttl_seconds: { type: "integer" }, expires_at_utc: date, stale: { type: "boolean" } }),
      Snapshot: props({ analysis: ref("Analysis"), collection_status: { type: "string", enum: ["ready", "degraded", "stale"] }, cache: ref("Cache"), warning: str }, ["analysis", "collection_status", "cache"]),
      Digest: { allOf: [ref("Snapshot"), props({ turn: { type: "integer", minimum: 1, maximum: 999999 }, mode: { const: "local_preview" }, archive_written: { const: false }, markdown: str, social_drafts: array(props({ platform: str, text: str })) })] },
      Health: props({ status: { const: "ok" }, mode: { const: "read_only" }, cache_ttl_seconds: { type: "integer" }, collection: { type: "string", enum: ["not_collected", "cached", "expired"] }, collection_in_flight: { type: "boolean" }, last_collected_at_utc: { type: ["string", "null"], format: "date-time" } }),
    } },
  };
}
