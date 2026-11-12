import { load } from 'cheerio';
import { assertOfficialUrl } from './network.mjs';
import { classifyKEV } from './validation.mjs';

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const visibleText = selection => {
  const copy = selection.clone();
  // Cheerio text() concatenates adjacent HTML blocks without spaces. In CISA's
  // layout that joins "Release Date" to "November" and CVEs to the next block.
  // Preserve word boundaries without changing the original DOM used for tables.
  copy.find('div,p,li,h1,h2,h3,h4,h5,h6,tr,br,time').append('\n');
  return clean(copy.text());
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function parseDate(text) {
  const s = clean(text);
  // ISO dates are followed by T in official datetime attributes, so a word
  // boundary after the day would incorrectly discard a valid timestamp.
  const iso = s.match(/\b(\d{4}-\d{2}-\d{2})(?!\d)/);
  if (iso && validDate(iso[1])) return iso[1];
  const md = s.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
  const dm = s.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  const match = md ?? dm;
  if (!match) return null;
  const month = MONTHS.indexOf((md ? match[1] : match[2]).slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const date = `${match[3]}-${String(month + 1).padStart(2, '0')}-${String(md ? match[2] : match[1]).padStart(2, '0')}`;
  return validDate(date) ? date : null;
}
function validDate(s) { const date = new Date(`${s}T00:00:00Z`); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === s; }
function stripChrome($) {
  $('script,style,nav,footer,header,[role="navigation"],.usa-banner,.breadcrumb,.c-breadcrumb,.c-share,.c-related-content').remove();
}
export function discoverAdvisories(html, indexUrl, kind, limit) {
  const $ = load(html);
  stripChrome($);
  const main = $('main').length ? $('main') : $.root();
  const seen = new Set();
  const links = [];
  main.find('a[href]').each((order, el) => {
    let url;
    try { url = assertOfficialUrl(new URL($(el).attr('href'), indexUrl).href); } catch { return; }
    const path = new URL(url).pathname;
    const pattern = kind === 'ic3' ? /^\/PSA\/\d{4}\/[^/]+$/i
      : kind === 'ics' ? /^\/news-events\/ics-advisories\/[^/]+$/
        : /^\/news-events\/(?:cybersecurity-advisories|alerts)\/[^/]+(?:\/[^/]+)*$/;
    const title = clean($(el).text());
    if (!pattern.test(path) || seen.has(url) || !title || /\.pdf$/i.test(path)) return;
    seen.add(url);
    // Cards and IC3 list items carry their own date; never infer "today".
    const card = $(el).closest('article,li,.views-row,.c-teaser,.c-card,.usa-card');
    const date = parseDate(card.find('time').attr('datetime') ?? card.text()) ?? dateFromIc3Url(url);
    links.push({ title, source: url, date, order });
  });
  links.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.order - b.order);
  if (!links.length && limit) throw new Error('Official index contains no supported HTML detail links; check for layout changes or PDF-only releases');
  return links.slice(0, limit);
}
function dateFromIc3Url(url) {
  const m = url.match(/\/PSA\/(\d{4})\/PSA\d{2}(\d{2})(\d{2})(?:-|$|\.)/i);
  if (!m) return null;
  const d = `${m[1]}-${m[2]}-${m[3]}`;
  return validDate(d) ? d : null;
}
export function parseAdvisory(html, source, { kind = 'ics', title: fallbackTitle, date: fallbackDate } = {}) {
  assertOfficialUrl(source);
  const $ = load(html);
  // Read date/title before stripping chrome: IC3 puts its h1 and time above main.
  const title = clean($('h1').first().text()) || fallbackTitle;
  let date = parseDate($('time[datetime]').first().attr('datetime'));
  const fullText = visibleText($.root());
  const release = fullText.match(/Release Date\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
  date = (release ? parseDate(release[1]) : date) ?? fallbackDate ?? dateFromIc3Url(source);
  stripChrome($);
  const main = $('main').length ? $('main').first() : $('article').first();
  if (!main.length) throw new Error('Official detail has no main/article content; check source layout');
  main.find('.c-related-content,.related-advisories,.field--name-field-related-content').remove();
  main.find('h2,h3').filter((_, el) => /^Related (?:Advisories|Content)$/i.test(clean($(el).text()))).each((_, el) => $(el).closest('.c-collection').remove());
  const body = main.find('.field--name-body').first();
  const content = body.length ? body : main;
  const text = visibleText(content);
  if (!title || !date || text.length < 50) throw new Error('Official detail missing a valid title, release date, or substantive content');
  const paragraphs = [];
  content.find('p').each((_, el) => {
    const p = clean($(el).text());
    if (p.length >= 40 && !/^This product is provided|^An official website|^Official websites|^Secure .gov/i.test(p)) paragraphs.push(p);
  });
  const summaryHeading = content.find('h2,h3').filter((_, el) => /^summary$/i.test(clean($(el).text()))).first();
  let summary = '';
  if (summaryHeading.length) {
    const section = summaryHeading.nextUntil('h2,h3');
    summary = clean(section.filter('p').first().text() || section.find('p').first().text());
  }
  // Keep a verbatim excerpt, not synthesized claims. Some older CISA layouts
  // are list-led; the first substantive content is the fallback, visibly truncated.
  summary ||= paragraphs[0] ?? text;
  const truncated = summary.length > 1600;
  summary = summary.slice(0, 1600) + (truncated ? '… [excerpt truncated]' : '');
  const cves = [...new Set(text.match(/\bCVE-\d{4}-\d{4,}\b/g) ?? [])].sort();
  const scores = [];
  // Explicit source metrics remain separate from our operational label. Do not
  // turn a bare "9.8" in a version/product string into a made-up CVSS score.
  content.find('table tr').each((_, el) => {
    const cells = $(el).find('td').map((__, td) => clean($(td).text())).get();
    if (cells.length >= 3 && /^(?:3\.[01]|4\.0)$/.test(cells[0]) && /^\d(?:\.\d)?$|^10(?:\.0)?$/.test(cells[1]) && /^(?:CRITICAL|HIGH|MEDIUM|LOW|NONE)$/i.test(cells[2])) {
      scores.push({ version: cells[0], base_score: Number(cells[1]), base_severity: cells[2].toUpperCase(), source });
    }
  });
  const label = cves.length ? classifyKEV({ cve: cves[0], description: text, name: title }) : { operational_priority: 'Anomaly', priority_rationale: 'Non-CVE official advisory: monitoring label, not evidence of a vulnerability severity or confirmed exploitation.' };
  return {
    title, date, source, summary, severity: label.operational_priority, cves,
    severity_basis: 'rule_based_operational_priority_not_cvss',
    priority_rationale: cves.length ? `Advisory text signals only; this does not assert KEV inclusion or active exploitation. ${label.priority_rationale.replaceAll('Known exploitation', 'Textual impact')}` : label.priority_rationale,
    observed_cvss: scores.filter((v, i) => scores.findIndex(x => x.version === v.version && x.base_score === v.base_score) === i),
    excerpt: summary, source_kind: kind,
  };
}
