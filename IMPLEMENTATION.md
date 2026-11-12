# Implementation handoff

## Delivered app

Workspace: `/home/ubuntu/global-fusion-console`

One polished public dark console with persistent top navigation and responsive layouts. Pages: `/` intelligence overview, `/digest` preview report and six social draft tabs, `/integrations` CLI/REST/MCP/Action documentation, `/privacy` privacy and support. GitHub Pages uses hash routes for the same pages.

Features: catalog count/version/freshness, source-check summary and full error audit, five transparent operational priority bins and exact engine criteria, CVE/vendor/product search, vendor/priority filters, accessible KEV remediation drawer, official source links, CISA ICS/FBI IC3 advisory cards, explicit local preview separation from Audrey TURN002, Markdown/JSON downloads, draft/report copy/download controls, and no publishing/account/revenue fiction.

## Server surfaces

Public typed tRPC queries: `intelligence.snapshot`, `intelligence.render({turn})`.

Third-party routes on the existing Express app:

- `GET /api/v1/intelligence`
- `GET /api/v1/digest?turn=N` (default 1; integer 1–999999)
- `GET /api/v1/health`
- `GET /api/v1/openapi.json`

JSON errors for invalid input, unavailable sources, unknown routes, rate limits, and non-read methods. CORS supports public reads. Shared 10-minute memory cache, in-flight request deduplication, 30-second failure backoff, and explicitly marked stale fallback bounded to one hour. No scheduled work or persistent archive writes. Public render returns `mode: local_preview`, `archive_written: false` and a visible Markdown preview notice.

## Verified results

`pnpm check`, `pnpm test` (40 tests across five files), `pnpm build`, `pnpm build:pages`, and frozen lockfile installation passed. Existing server HTTP health, invalid-turn 400, generated OpenAPI, all four UI routes, intelligence and digest routes were directly verified. Snapshot and digest share the same collection timestamp. No browser was used to avoid conflicting with parent navigation; visual viewport verification remains a launch-coordinator check.

Final Pages build collection: `2026-11-12T19:11:02.419Z`, **ready**, 1779 total catalog entries, 12 selected KEVs, Critical 4 / High 5 / Anomaly 0 / Medium 3 / Low 0, 3 ICS details, 3 IC3 details, six platform drafts, no source errors.

Vendored upstream modules match the shared collector working tree as of final resync. If the core changes again before export, recopy matching modules and schemas and rerun builds; do not fork its classifier.

## Launch commands

```bash
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm install --frozen-lockfile
pnpm check && pnpm test
pnpm build:pages
```

Upload `dist/public` to GitHub Pages. `.github/workflows/pages.yml` already defines pinned-action build/deploy on `main` push and manual dispatch, with no scheduled runs. Set GitHub Pages source to GitHub Actions. `PAGES_BASE` defaults to `/global-fusion-console/`.

The Pages UI explicitly labels fixed data, disables browser refresh/turn changes, and uses a custom tRPC link serving generated bundled snapshots. Static files: `snapshot/intelligence.json`, `snapshot/digest.json`, `snapshot/report.md`, `snapshot/social-drafts.json`, `snapshot/manifest.json`, `snapshot/fullstack-openapi.json` (reference only). No claim of realtime REST on Pages.

For Node hosting: `pnpm build && pnpm start`. The build copies immutable engine modules and schema assets into `dist`, not writable archives.

No GitHub commit, push, publishing, or new listener was performed by the app implementation specialist. Parent owns sanitized repository export, deployment, and final checkpoint. Preserve existing template auth and project files; generated schema differences predated app feature work and were not touched here.
