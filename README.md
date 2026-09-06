# ArcadeLink

ArcadeLink is a Cloudflare-first web MVP for static QR/NDEF arcade cabinet login.

## Project Structure

- `src`: React + Vite user and merchant UI.
- `worker`: Hono Cloudflare Worker API with D1, KV, Turnstile hooks, and HINATA IO forwarding.
- `migrations`: D1 SQL migrations.
- `scripts`: Utility scripts (including dynamic Wrangler config generation).

## Local Setup

```sh
bun install
bun run db:migrate:local
bun run dev
```

Copy `.dev.vars.example` to `.dev.vars` for local secrets.

## Deployment Notes

Run `bun run build` to build the web UI and generate `wrangler.generated.jsonc`.

Cloudflare Worker deployment settings can be configured via environment variables (e.g. `ARCADELINK_WORKER_NAME`, `ARCADELINK_ACCOUNT_ID`, `ARCADELINK_D1_DATABASE_ID`).

Set these Worker secrets in Cloudflare:

- `SESSION_SECRET`
- `URL_ENCRYPTION_KEY`
- `TURNSTILE_SECRET_KEY`
- `MUNET_CLIENT_SECRET`

Production deploys one Worker with Workers Assets:

- `https://link.neri.moe/` serves the React app from `dist/`.
- `https://link.neri.moe/api/*` runs the Worker API first.

