export const PRIORITIES = ["Critical", "High", "Anomaly", "Medium", "Low"] as const;
export type Priority = typeof PRIORITIES[number];
export interface KevItem {
  cve: string;
  vendor: string;
  product: string;
  name: string;
  date_added: string;
  due_date: string;
  description: string;
  required_action: string;
  operational_priority: Priority;
  priority_rationale: string;
  source: string;
}
export interface Advisory {
  title: string;
  date: string;
  source: string;
  summary: string;
  severity: string;
  cves: string[];
}
export interface SourceStatus {
  name: string;
  url: string;
  status: string;
  retrieved_at: string;
  error?: string;
}
export interface Analysis {
  generated_at_utc: string;
  catalog_version: string;
  catalog_release_date: string;
  catalog_entry_count: number;
  collection_status?: string;
  analysis_scope?: string;
  priority_method?: Record<Priority, string>;
  cisa_cyber_advisories?: Advisory[];
  severity_counts: Record<Priority, number>;
  recent_kev: KevItem[];
  ics_advisories: Advisory[];
  official_ic3_items: Advisory[];
  source_status: SourceStatus[];
}
export interface Snapshot {
  analysis: Analysis;
  collection_status: "ready" | "degraded" | "stale";
  cache: { ttl_seconds: number; expires_at_utc: string; stale: boolean };
  warning?: string;
}
export interface SocialDraft { platform: string; text: string }
export interface Digest extends Snapshot {
  turn: number;
  mode: "local_preview";
  archive_written: false;
  markdown: string;
  social_drafts: SocialDraft[];
}
export const REPOSITORY = "https://github.com/midnghtsapphire/global-fusion-digest";
export function sourceIsHealthy(status: string) {
  return ["ok", "success", "healthy", "available"].includes(status.toLowerCase());
}
