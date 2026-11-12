import { validateAnalysis, PRIORITIES } from './validation.mjs';
import { integerOption } from './network.mjs';

export const SEVERITY_EMOJI = Object.freeze({ Critical: '🔴', High: '🟧', Anomaly: '🔵', Medium: '🟡', Low: '⚪' });
export const PLATFORMS = Object.freeze(['LinkedIn', 'Facebook', 'Instagram', 'TikTok', 'Lemon8', 'Reddit']);
const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\[\]*_`#|\\]/g, '\\$&');
const cite = url => url.replaceAll('(', '%28').replaceAll(')', '%29');
const label = p => `${SEVERITY_EMOJI[p]}${p}`;
function assertTurn(turn) { return integerOption(turn, 'turn', 0, 999999999, 0); }
export function buildReport(analysis, { turn = 0 } = {}) {
  validateAnalysis(analysis);
  assertTurn(turn);
  const lines = [
    `# Global Fusion Digest — Turn ${turn}`,
    '', `Generated UTC: ${analysis.generated_at_utc}`,
    `Catalog: ${escape(analysis.catalog_version)} | Release: ${analysis.catalog_release_date} | Entries: ${analysis.catalog_entry_count}`,
    `Collection: **${analysis.collection_status}**. ${escape(analysis.analysis_scope ?? '')}`,
    '', '## Operational priorities', '',
    PRIORITIES.map(p => `${label(p)} ${analysis.severity_counts[p]}`).join(' · '),
    '', 'These are transparent, rule-based operational triage labels, not CVSS, vendor severity, asset-specific risk, or a claim of new exploitation. Counts cover the selected KEVs only. KEV inclusion means CISA has identified exploitation; missing higher-priority keywords does not make an entry safe.',
    '', '## Recent CISA known exploited vulnerabilities', '',
  ];
  for (const v of analysis.recent_kev) {
    lines.push(`### ${label(v.operational_priority)} — ${escape(v.cve)}: ${escape(v.name)}`, '',
      `Vendor/product: ${escape(v.vendor)} / ${escape(v.product)}. Added: ${v.date_added}. CISA catalog due date: ${v.due_date}; confirm applicability to your organization.`, '',
      `Source excerpt: ${escape(v.description)}`, '', `Required action — source excerpt: ${escape(v.required_action)}`, '',
      `Operational rationale: ${escape(v.priority_rationale)}`, '', `[Official CISA KEV source](${cite(v.source)})`, '');
  }
  for (const [heading, items] of [['CISA ICS advisories', analysis.ics_advisories], ['Official FBI IC3 items', analysis.official_ic3_items], ['CISA cyber advisories', analysis.cisa_cyber_advisories ?? []]]) {
    lines.push(`## ${heading}`, '');
    if (!items.length) lines.push('No verified detail items collected. Consult Source status below; an unavailable or disabled source is not evidence that there are no threats.', '');
    for (const item of items) {
      lines.push(`### ${label(item.severity)} — ${escape(item.title)}`, '', `Published: ${item.date}. CVEs: ${item.cves.length ? item.cves.join(', ') : 'None identified in the retrieved text'}.`, '', `Source excerpt: ${escape(item.summary)}`, '');
      if (item.observed_cvss?.length) lines.push(`Observed source CVSS metrics (separate from our label): ${item.observed_cvss.map(s => `v${s.version} ${s.base_score} ${s.base_severity}`).join('; ')}.`, '');
      if (item.priority_rationale) lines.push(`Operational rationale: ${escape(item.priority_rationale)}`, '');
      lines.push(`[Official detail and full recommendations](${cite(item.source)})`, '');
    }
  }
  lines.push('## Resilience Tip', '', 'Reconcile the KEV list against your asset inventory, confirm exposure and vendor mitigation guidance, and test recovery from an offline backup. For operational technology, coordinate changes with operators and validate safety and rollback before patching.', '',
    '## Ad-Hoc Note', '', 'This digest is a bounded source snapshot, not an exhaustive threat feed. Summaries are source excerpts, not independent confirmation. No social content was published and no engagement was observed. Failed sources remain visible; never interpret missing data as a clean bill of health.', '',
    '## Contacts', '', '[Report a cyber issue to CISA](https://www.cisa.gov/report). [File an internet crime complaint with FBI IC3](https://www.ic3.gov/Home/ComplaintChoice). For an immediate threat to life or safety, contact local emergency services.', '',
    '## Source status', '');
  for (const s of analysis.source_status) lines.push(`- **${escape(s.name)}: ${s.status}** — retrieved/attempted ${s.retrieved_at}; [source](${cite(s.url)})${s.error ? `; ${escape(s.error)}` : ''}`);
  lines.push('', '## Priority rules', '');
  for (const p of PRIORITIES) lines.push(`- ${label(p)}: ${escape(analysis.priority_method?.[p] ?? '')}`);
  lines.push('');
  return lines.join('\n');
}
export function buildSocialDrafts(analysis, { turn = 0 } = {}) {
  validateAnalysis(analysis); assertTurn(turn);
  const top = analysis.recent_kev.slice(0, 3);
  const threats = top.map(v => `${label(v.operational_priority)} ${v.cve} — ${v.vendor} ${v.product}`).join('\n');
  const citations = [...new Set([top[0]?.source, analysis.ics_advisories[0]?.source, analysis.official_ic3_items[0]?.source].filter(Boolean))].join('\n');
  const counts = PRIORITIES.map(p => `${label(p)} ${analysis.severity_counts[p]}`).join(' | ');
  const context = `Global Fusion Digest · Turn ${turn}\nUTC ${analysis.generated_at_utc}\nSelected KEVs: ${analysis.recent_kev.length} of ${analysis.catalog_entry_count}; catalog ${analysis.catalog_version}.\n${counts}\n${threats}\nCollection status: ${analysis.collection_status}. Operational labels are rule-based, not CVSS.`;
  const action = 'Resilience Tip: verify affected assets, follow vendor mitigations, and test recovery. Ad-Hoc Note: bounded source snapshot; missing data is not absence of risk.';
  const sources = `Official sources:\n${citations}\nReport: https://www.cisa.gov/report | https://www.ic3.gov/Home/ComplaintChoice`;
  // Platform-specific format only, no fabricated quotes, performance estimates,
  // trending claims, reactions, or automated posting. Draft state is explicit.
  return {
    LinkedIn: `${context}\n\n${action}\n\n${sources}\n\nDraft — not published. #Cybersecurity #Resilience`,
    Facebook: `${context}\n\nCheck your systems against the official guidance before sharing an alert.\n${action}\n\n${sources}\nDraft — not published.`,
    Instagram: `${context}\n\nCarousel draft: 1) Verified source snapshot 2) Selected KEVs above 3) ${action}\n\n${sources}\nDraft — not published. #CyberAwareness #DigitalSafety`,
    TikTok: `Video script draft — not published:\n[Opening] Global Fusion Digest, turn ${turn}.\n[On-screen evidence]\n${context}\n[Close] ${action}\nCaption sources:\n${sources}`,
    Lemon8: `${context}\n\nSecurity checklist draft:\n1. Match official advisories to assets.\n2. Verify vendor fixes and safe rollback.\n3. Test offline recovery.\n${action}\n\n${sources}\nDraft — not published.`,
    Reddit: `Title: Global Fusion Digest — source-grounded KEV review, turn ${turn}\n\n${context}\n\n${action}\n\n${sources}\n\nPrepared discussion draft, not posted. Check community rules and the original advisories. No engagement has been observed.`,
  };
}
export function buildPlatformLedger(analysis, { turn = 0 } = {}) {
  assertTurn(turn);
  return PLATFORMS.map(platform => ({ platform, turn, posting_state: 'draft', publication_state: 'not_published', drafted_at_utc: analysis.generated_at_utc, published_at_utc: null, remote_post_id: null, remote_url: null, engagement: null }));
}
