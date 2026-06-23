# Cloudflare Workers — Deployment

This directory contains two Cloudflare Workers that run alongside the
IndustriaX Next.js app (which is deployed to Vercel, not Cloudflare).

## Workers

| Worker | Path | Purpose |
|--------|------|---------|
| `markettick` | `cloudflare/markettick/` | 60s cron that drives the global market simulation |
| `newsgenerator` | `cloudflare/newsgenerator/` | AI-powered batched news headline generator (Workers AI) |

## Deployment

**Both workers are deployed manually** with `wrangler deploy`, not by the
Cloudflare GitHub App's auto-build pipeline. The reason is that the App
auto-detects the repo root as a Next.js project (because of the root
`package.json` with `next build`) and tries to run the
`@opennextjs/cloudflare` migration, which fails because the App's
OpenNext path does not support Node.js middleware (`src/proxy.ts`).

## Manual deploy

```bash
# From each worker directory
cd cloudflare/markettick
npx wrangler deploy
# or via npm script
npm run deploy

cd ../newsgenerator
npx wrangler deploy
```

## GitHub App check ("Workers Builds: <worker>")

The Cloudflare GitHub App fires a `Workers Builds: <worker>` check on
every push to `main`. This check is the App's auto-build pipeline and
**fails by design** for this repo (it tries to deploy the wrong thing).

**If you see this check failing:**

1. Open Cloudflare dashboard → Workers & Pages → `markettick` (and
   `newsgenerator`) → Settings → **Builds** → **Disconnect from GitHub**.
2. Repeat for both workers.
3. Future pushes will no longer trigger the App's build pipeline. The
   `Workers Builds: <worker>` check will no longer appear.

The actual workers will continue to function (they're deployed manually
and have been since 2026-06-16). You can verify via:

```bash
wrangler tail --name markettick   # live logs
wrangler tail --name newsgenerator
```

## CI configuration

The CI pipeline is **not** expected to deploy the workers. The
`Workers Builds: <worker>` check is purely informational and is excluded
from the `all-pass` gate in `.github/workflows/test.yml`.
