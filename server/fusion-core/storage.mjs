import { mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { collectIntelligence, getRawSnapshots } from './collect.mjs';
import { buildReport, buildSocialDrafts, buildPlatformLedger } from './render.mjs';
import { integerOption, sha256 } from './network.mjs';
import { validateAnalysis } from './validation.mjs';
const json = value => JSON.stringify(value, null, 2) + '\n';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function durableWrite(path, bytes) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(path) { const handle = await open(path, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function exists(path) { try { await stat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function readSmallJson(path, maxBytes = 65536) {
  if ((await stat(path)).size > maxBytes) throw new Error(`Local state exceeds size bound: ${path}`);
  return JSON.parse(await readFile(path, 'utf8'));
}
async function acquireLock(root, waitMs) {
  const lockPath = join(root, '.fusion.lock');
  const owner = { pid: process.pid, host: hostname(), id: randomUUID(), created_at: new Date().toISOString() };
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      await durableWrite(lockPath, json(owner));
      return async () => {
        const current = await readSmallJson(lockPath);
        if (current.id !== owner.id) throw new Error('Lock ownership changed unexpectedly; inspect .fusion.lock');
        await unlink(lockPath);
        await syncDirectory(root);
      };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Never expire an active writer on elapsed time: a slow filesystem/network
      // call must not permit a second writer. Only a provably dead local process
      // can be recovered; a remote-host or malformed lock requires operator review.
      let stale = false;
      try {
        const current = await readSmallJson(lockPath);
        if (current.host === hostname() && Number.isSafeInteger(current.pid) && current.pid > 0) {
          try { process.kill(current.pid, 0); } catch (error) { if (error.code === 'ESRCH') stale = true; }
        }
        if (stale) {
          // Recovery contenders create a second exclusive guard, preventing two
          // stale-lock removers from unlinking a newly acquired writer's lock.
          const guard = await open(join(root, '.fusion.recovery.lock'), 'wx', 0o600).catch(() => null);
          if (guard) {
            try {
              const check = await readSmallJson(lockPath).catch(() => null);
              if (check?.id === current.id) await unlink(lockPath);
            } finally { await guard.close(); await unlink(join(root, '.fusion.recovery.lock')); }
            continue;
          }
        }
      } catch { /* A new writer can be filling its lock; retry rather than remove it. */ }
      if (Date.now() >= deadline) throw new Error('Timed out waiting for digest lock. Check active writers; inspect .fusion.lock (do not remove an active lock).');
      await sleep(30 + Math.floor(Math.random() * 40));
    }
  }
}
async function archivedTurn(root) {
  let maximum = 0;
  const base = join(root, 'digests');
  if (!(await exists(base))) return maximum;
  for (const year of await readdir(base, { withFileTypes: true })) {
    if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) continue;
    for (const entry of await readdir(join(base, year.name), { withFileTypes: true })) {
      const m = entry.name.match(/^\d{4}-\d{2}-\d{2}-TURN-(\d+)$/);
      if (!entry.isDirectory() || !m) continue;
      const manifestPath = join(base, year.name, entry.name, 'manifest.json');
      // A directory is committed only when its final manifest was written and
      // atomically renamed into the archive. Corruption fails closed, not reset.
      const manifest = await readSmallJson(manifestPath, 1024 * 1024);
      if (manifest.turn !== Number(m[1]) || manifest.transaction_state !== 'committed') throw new Error(`Archive manifest mismatch: ${manifestPath}`);
      maximum = Math.max(maximum, manifest.turn);
    }
  }
  return maximum;
}
export async function runDigest(options = {}) {
  if (!options.outputDir || typeof options.outputDir !== 'string') throw new TypeError('outputDir is required');
  const seed = integerOption(options.seedLastTurn, 'seedLastTurn', 0, 999999998, 0);
  const lockTimeoutMs = integerOption(options.lockTimeoutMs, 'lockTimeoutMs', 100, 180000, 90000);
  const root = resolve(options.outputDir);
  await mkdir(root, { recursive: true, mode: 0o700 });
  // Collect outside the lock: no turn is allocated for source failures, and
  // concurrent network work doesn't serialize unrelated reads. Only commits lock.
  const analysis = validateAnalysis(options.analysis ?? await (options.collect ?? collectIntelligence)(options));
  const snapshots = getRawSnapshots(analysis);
  const release = await acquireLock(root, lockTimeoutMs);
  try {
    const statePath = join(root, 'state.json');
    let stateTurn = 0;
    if (await exists(statePath)) {
      const state = await readSmallJson(statePath);
      if (!Number.isSafeInteger(state.last_turn) || state.last_turn < 0) throw new Error('Invalid state.json last_turn; do not reset or overwrite it');
      stateTurn = state.last_turn;
    }
    const turn = Math.max(seed, stateTurn, await archivedTurn(root)) + 1;
    if (turn > 999999999) throw new Error('Turn counter exhausted');
    const date = analysis.generated_at_utc.slice(0, 10);
    const parent = join(root, 'digests', date.slice(0, 4));
    const digestPath = join(parent, `${date}-TURN-${String(turn).padStart(3, '0')}`);
    if (await exists(digestPath)) throw new Error('Archive already exists; refusing overwrite');
    const staging = join(root, '.transactions', randomUUID());
    await mkdir(join(staging, 'sources'), { recursive: true, mode: 0o700 });
    const files = [];
    const put = async (name, data) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      await durableWrite(join(staging, name), bytes);
      files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
    };
    await put('analysis.json', json(analysis));
    await put('source_status.json', json(analysis.source_status));
    await put('source_items.json', json(analysis.source_items));
    await put('report.md', buildReport(analysis, { turn }));
    const social = buildSocialDrafts(analysis, { turn });
    await put('social.json', json(social));
    await put('social.md', Object.entries(social).map(([platform, text]) => `# ${platform}\n\n${text}\n`).join('\n'));
    const ledger = buildPlatformLedger(analysis, { turn });
    await put('platform_ledger.json', json(ledger));
    await put('posting_ledger.json', json({ turn, publication_state: 'not_published', platforms: ledger, engagement: null }));
    for (let i = 0; i < snapshots.length; i++) {
      const s = snapshots[i];
      const ext = s.content_type.includes('json') ? 'json' : 'html';
      const name = `sources/${String(i + 1).padStart(3, '0')}-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`;
      await put(name, s.bytes);
      files.at(-1).source_url = s.url;
      files.at(-1).retrieved_at = s.retrieved_at;
    }
    const manifest = { schema_version: 1, turn, generated_at_utc: analysis.generated_at_utc, transaction_state: 'committed', publication_state: 'not_published', engagement: null, raw_snapshot_count: snapshots.length, snapshot_note: snapshots.length ? 'Exact retrieved response bytes, including optional-source parse failures.' : 'Analysis supplied by caller; no raw retrieval snapshots available.', files };
    await durableWrite(join(staging, 'manifest.json'), json(manifest));
    await syncDirectory(join(staging, 'sources'));
    await syncDirectory(staging);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    await rename(staging, digestPath);
    await syncDirectory(parent);
    // All artifacts are durable BEFORE counter advancement. If the process dies
    // here, archivedTurn recovers the committed turn on the next run; no reuse.
    const temporaryState = join(root, `.state-${randomUUID()}.json`);
    await durableWrite(temporaryState, json({ schema_version: 1, last_turn: turn, last_digest: relative(root, digestPath), updated_at_utc: new Date().toISOString() }));
    await rename(temporaryState, statePath);
    await syncDirectory(root);
    return { turn, digest_path: digestPath, report_path: join(digestPath, 'report.md'), analysis_path: join(digestPath, 'analysis.json'), social_path: join(digestPath, 'social.json'), manifest_path: join(digestPath, 'manifest.json') };
  } finally { await release(); }
}
