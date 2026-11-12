import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const catalogValidator = ajv.compile(JSON.parse(readFileSync(new URL('../schemas/kev.schema.json', import.meta.url), 'utf8')));
export const CVE_PATTERN = /^CVE-\d{4}-\d{4,}$/;
export const PRIORITIES = Object.freeze(['Critical', 'High', 'Anomaly', 'Medium', 'Low']);
export const PRIORITY_METHOD = Object.freeze({
  Critical: 'Known exploitation plus code/command execution or authentication bypass and an explicit unauthenticated, remote, root, administrator, or ransomware consequence in the record.',
  High: 'Known exploitation plus code/command execution, authentication bypass, privilege escalation, sensitive-data exposure, spoofing, or recorded ransomware use.',
  Anomaly: 'Non-CVE advisory or campaign retained for monitoring; not a vendor severity score.',
  Medium: 'Known exploitation without the higher-priority lexical signals; validate asset exposure and business impact. Never implies safe to ignore.',
  Low: 'Reserved; not assigned to KEV entries because catalog inclusion establishes exploitation.',
});
export function validateCatalog(catalog) {
  if (!catalogValidator(catalog)) throw new Error(`Invalid KEV catalog: ${ajv.errorsText(catalogValidator.errors).slice(0, 1200)}`);
  if (catalog.count !== catalog.vulnerabilities.length) throw new Error('Invalid KEV catalog: count does not match entries');
  const seen = new Set();
  for (const v of catalog.vulnerabilities) {
    if (seen.has(v.cveID)) throw new Error(`Invalid KEV catalog: duplicate CVE ${v.cveID}`);
    if (v.dueDate < v.dateAdded) throw new Error(`Invalid KEV catalog: due date precedes addition for ${v.cveID}`);
    seen.add(v.cveID);
  }
  return catalog;
}

// This is intentionally deterministic, not an LLM verdict, CVSS calculation,
// deadline mandate, or asset-specific risk score. No CVE/date override tables.
// Only the vulnerability name/description are scanned: boilerplate requiredAction
// can mention forensics or cloud services for every entry and must not inflate risk.
export function classifyKEV(record) {
  if (!record || !CVE_PATTERN.test(record.cveID ?? record.cve ?? '')) throw new TypeError('A valid CVE record is required');
  const text = `${record.vulnerabilityName ?? record.name ?? ''} ${record.shortDescription ?? record.description ?? ''}`.toLowerCase();
  const execution = /(?:remote code execution|arbitrary code|code execution|(?:remotely )?execute (?:arbitrary )?code|command (?:execution|injection)|os command injection|authentication bypass|bypass authentication)/.test(text);
  const consequence = /\b(?:unauthenticated|remote|remotely|root|administrator)\b/.test(text);
  const ransomware = /^known$/i.test(record.knownRansomwareCampaignUse ?? record.known_ransomware_campaign_use ?? '');
  let operational_priority = 'Medium';
  if (execution && (consequence || ransomware)) operational_priority = 'Critical';
  else if (execution || ransomware || /privilege escalation|elevation of privilege|sensitive (?:information|data|configuration)|spoofing|information disclosure|data exfiltration/.test(text)) operational_priority = 'High';
  return { operational_priority, priority_rationale: PRIORITY_METHOD[operational_priority] };
}

export function validateAnalysis(analysis) {
  if (!analysisValidator(analysis)) throw new Error(`Invalid analysis: ${ajv.errorsText(analysisValidator.errors).slice(0, 1200)}`);
  return analysis;
}
const analysisValidator = ajv.compile(JSON.parse(readFileSync(new URL('../schemas/analysis.schema.json', import.meta.url), 'utf8')));
