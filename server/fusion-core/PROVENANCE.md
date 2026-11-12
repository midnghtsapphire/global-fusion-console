# Vendored engine provenance

Copied from the user-authorized working tree of `midnghtsapphire/global-fusion-digest` on 2026-11-12. This copy contains the upstream `index`, `collect`, `network`, `parsers`, `validation`, `render`, and `storage` modules unchanged. Its validation schemas live beside the engine at `server/schemas`, matching the relative schema imports.

The app only imports `collectIntelligence`, `buildReport`, and `buildSocialDrafts`; it never invokes the archive-writing `runDigest` export. Classification, official source fetching, and content rendering remain upstream logic. The HTTP/tRPC adapter and cache do not implement a second classifier or fetch engine.

Preserve the included MIT license. Recopy matched core source and schemas after verified upstream changes. The launch coordinator will record the final upstream commit and publish sanitized repository exports; no source commit or release publication is performed by this app implementation step.
