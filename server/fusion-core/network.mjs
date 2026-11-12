import { createHash } from 'node:crypto';

export const SOURCES = Object.freeze({
  kev: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
  ics: 'https://www.cisa.gov/news-events/ics-advisories',
  ic3: 'https://www.ic3.gov/PSA',
  cyber: 'https://www.cisa.gov/news-events/cybersecurity-advisories',
});
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export function assertOfficialUrl(input) {
  const u = new URL(input);
  const cisaPath = u.pathname === new URL(SOURCES.kev).pathname || /^\/news-events\/(?:ics-advisories|cybersecurity-advisories|alerts)(?:\/|$)/.test(u.pathname);
  const ic3Path = /^\/PSA(?:\/|$)/i.test(u.pathname);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash ||
      !((u.hostname === 'www.cisa.gov' && cisaPath) || (u.hostname === 'www.ic3.gov' && ic3Path))) {
    throw new Error('URL is outside the official CISA/IC3 source allowlist');
  }
  return u.href;
}
export function integerOption(value, name, min, max, fallback) {
  const v = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(v) || v < min || v > max) throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  return v;
}

// Redirects are checked individually, not after the request: an official page
// must never turn this reader into an arbitrary-URL/SSRF proxy. No credentials,
// cookies, external vendor links, or unbounded response.text() are used.
export async function fetchOfficial(url, { timeoutMs = 15000, maxBytes = 8 * 1024 * 1024, fetchImpl = globalThis.fetch, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Source request timed out')), timeoutMs);
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    let current = assertOfficialUrl(url);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetchImpl(current, {
        redirect: 'manual', signal: controller.signal,
        headers: { 'user-agent': 'GlobalFusionDigest/1.0 (+official-source reader)', accept: 'application/json,text/html;q=0.9' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirects === 3) throw new Error('Invalid or excessive source redirects');
        current = assertOfficialUrl(new URL(location, current).href);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Official source returned HTTP ${response.status}; check source availability or network access`);
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        throw new Error(`Source response exceeds ${maxBytes} byte cap`);
      }
      if (!response.body) throw new Error('Source returned an empty response body');
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new Error(`Source response exceeds ${maxBytes} byte cap`);
          chunks.push(Buffer.from(value));
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      const bytes = Buffer.concat(chunks);
      if (!bytes.length) throw new Error('Source returned an empty response body');
      return { url: current, text: bytes.toString('utf8'), bytes, content_type: response.headers.get('content-type') || '', sha256: sha256(bytes), retrieved_at: new Date().toISOString() };
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function mapBounded(items, concurrency, fn) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next++; result[index] = await fn(items[index], index); }
  }));
  return result;
}
