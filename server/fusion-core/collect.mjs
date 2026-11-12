import { SOURCES, fetchOfficial, integerOption, mapBounded } from './network.mjs';
import { validateCatalog, classifyKEV, PRIORITIES, PRIORITY_METHOD, validateAnalysis } from './validation.mjs';
import { discoverAdvisories, parseAdvisory } from './parsers.mjs';

const rawSnapshots = new WeakMap();
export const getRawSnapshots = analysis => rawSnapshots.get(analysis) ?? [];
export class CollectionError extends Error {
  constructor(message, sourceStatus, cause) { super(message, { cause }); this.name = 'CollectionError'; this.source_status = sourceStatus; }
}
export async function collectIntelligence(options = {}) {
  const limit = integerOption(options.limit, 'limit', 1, 100, 12);
  const advisoryLimit = integerOption(options.advisoryLimit, 'advisoryLimit', 0, 10, 3);
  const timeoutMs = integerOption(options.timeoutMs, 'timeoutMs', 100, 60000, 35000);
  const budgetMs = integerOption(options.budgetMs, 'budgetMs', 100, 180000, 60000);
  const maxBytes = integerOption(options.maxBytes, 'maxBytes', 1024, 16 * 1024 * 1024, 8 * 1024 * 1024);
  const includeCyber = options.includeCyber ?? true;
  if (typeof includeCyber !== 'boolean') throw new TypeError('includeCyber must be boolean');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Collection deadline exceeded')), budgetMs);
  const statuses = [], snapshots = [], sourceItems = [];
  const now = () => new Date().toISOString();
  const request = async (name, url, parse) => {
    let snapshot;
    try {
      snapshot = await fetchOfficial(url, { timeoutMs, maxBytes, fetchImpl: options.fetchImpl, signal: controller.signal });
      snapshots.push({ ...snapshot, name });
      const parsed = await parse(snapshot.text);
      statuses.push({ name, url: snapshot.url, status: 'ok', retrieved_at: snapshot.retrieved_at });
      sourceItems.push({ name, url: snapshot.url, retrieved_at: snapshot.retrieved_at, sha256: snapshot.sha256, excerpt: parsed.summary ?? (name === 'CISA KEV' ? `Catalog ${parsed.catalogVersion}; ${parsed.count} entries; released ${parsed.dateReleased}` : 'Official index used for dynamic detail discovery.') });
      return parsed;
    } catch (error) {
      statuses.push({ name, url, status: 'error', retrieved_at: snapshot?.retrieved_at ?? now(), error: String(error.message).slice(0, 1400) });
      return null;
    }
  };
  try {
    const catalog = await request('CISA KEV', SOURCES.kev, text => validateCatalog(JSON.parse(text)));
    // KEV is the digest's foundation. Do not silently use an old fixture/catalog
    // when it is unavailable. Optional sources may degrade; this one must fail.
    if (!catalog) throw new CollectionError('Required CISA KEV catalog could not be retrieved/validated. No digest or turn committed; check source_status and network access.', statuses);
    const recent = [...catalog.vulnerabilities].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded) || b.cveID.localeCompare(a.cveID)).slice(0, limit);
    const recent_kev = recent.map(v => ({
      cve: v.cveID, vendor: v.vendorProject, product: v.product, name: v.vulnerabilityName,
      date_added: v.dateAdded, due_date: v.dueDate, description: v.shortDescription, required_action: v.requiredAction,
      ...classifyKEV(v), source: SOURCES.kev,
      known_ransomware_campaign_use: v.knownRansomwareCampaignUse ?? 'Unknown',
      forensic_triage: v.forensicTriage ?? null, cwes: v.cwes ?? [], notes: v.notes ?? '',
    }));
    const groups = [
      { kind: 'ics', name: 'CISA ICS', url: SOURCES.ics, enabled: advisoryLimit > 0 },
      { kind: 'ic3', name: 'FBI IC3', url: SOURCES.ic3, enabled: advisoryLimit > 0 },
      { kind: 'cyber', name: 'CISA Cyber', url: SOURCES.cyber, enabled: includeCyber && advisoryLimit > 0 },
    ];
    // Maximum three concurrent fetches, including detail pages across groups.
    // First collect indexes, then flatten selected details into one bounded queue.
    const discoveries = await mapBounded(groups, 3, async group => {
      if (!group.enabled) { statuses.push({ name: group.name, url: group.url, status: 'skipped', retrieved_at: now() }); return []; }
      return await request(group.name, group.url, text => discoverAdvisories(text, group.url, group.kind, advisoryLimit)) ?? [];
    });
    const tasks = groups.flatMap((group, i) => discoveries[i].map(link => ({ ...link, group })));
    const details = await mapBounded(tasks, 3, task => request(`${task.group.name} detail`, task.source, text => parseAdvisory(text, task.source, { ...task, kind: task.group.kind })));
    const pick = kind => details.filter(item => item?.source_kind === kind).sort((a, b) => b.date.localeCompare(a.date));
    const severity_counts = Object.fromEntries(PRIORITIES.map(p => [p, recent_kev.filter(v => v.operational_priority === p).length]));
    const analysis = validateAnalysis({
      generated_at_utc: now(), catalog_version: catalog.catalogVersion, catalog_release_date: catalog.dateReleased,
      catalog_entry_count: catalog.count, collection_status: statuses.some(s => s.status === 'error') ? 'degraded' : 'ok',
      analysis_scope: `${recent_kev.length} most recently added KEVs; counts cover those KEVs only. Up to ${advisoryLimit} HTML detail items per enabled advisory index, sorted by published date when available.`,
      priority_method: PRIORITY_METHOD, severity_counts, recent_kev,
      ics_advisories: pick('ics'), official_ic3_items: pick('ic3'), cisa_cyber_advisories: pick('cyber'),
      source_status: statuses.sort((a, b) => a.name.localeCompare(b.name) || a.url.localeCompare(b.url)),
      source_items: sourceItems.sort((a, b) => a.name.localeCompare(b.name) || a.url.localeCompare(b.url)),
      retrieval_limits: { limit, advisory_limit: advisoryLimit, timeout_ms: timeoutMs, collection_budget_ms: budgetMs, max_response_bytes: maxBytes, concurrency: 3 },
    });
    rawSnapshots.set(analysis, snapshots);
    return analysis;
  } finally { clearTimeout(timer); }
}
