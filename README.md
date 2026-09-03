# ArcadeLink

ArcadeLink is a Cloudflare-first web MVP for static QR/NDEF arcade cabinet login.

## Apps

- `apps/web`: React + Vite user and merchant UI.
- `apps/worker`: Hono Cloudflare Worker API with D1, KV, Turnstile hooks, and HINATA IO forwarding.

## Local Setup

```sh
corepack enable
pnpm install
pnpm --filter @arcadelink/worker db:migrate:local
pnpm dev
```

Copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars` for local secrets.

## Deployment Notes

Create a D1 database and KV namespace, then update `apps/worker/wrangler.toml`.
Set these Worker secrets:

- `SESSION_SECRET`
- `URL_ENCRYPTION_KEY`
- `TURNSTILE_SECRET_KEY`
- `MUNET_CLIENT_SECRET`

Production deploys one Worker with Workers Assets:

- `https://link.neri.moe/` serves the React app.
- `https://link.neri.moe/api/*` runs the Worker API first.

GitHub Actions deploys on every push to `main` using the `CLOUDFLARE_API_TOKEN` repository secret.
