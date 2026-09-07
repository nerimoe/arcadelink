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

Copy `.dev.vars.example` to `.dev.vars` for local secrets. Copy `.env.example` to `.env` and fill in the Wrangler build inputs before running the Worker or deployment commands.

## Deployment Notes

Run `bun run build` to build the web UI and generate `wrangler.generated.jsonc`.

The Wrangler configuration is generated from environment variables. The following variables are required for production builds and must be configured in Cloudflare Workers **Settings > Build > Variables and secrets**:

- `ARCADELINK_WORKER_NAME`
- `ARCADELINK_ACCOUNT_ID`
- `ARCADELINK_ROUTE_PATTERN`
- `ARCADELINK_APP_ORIGIN`
- `ARCADELINK_MUNET_CLIENT_ID`
- `ARCADELINK_EXTRA_ALLOWED_ORIGINS`
- `ARCADELINK_APPLE_TEAM_ID`
- `ARCADELINK_D1_DATABASE_NAME`
- `ARCADELINK_D1_DATABASE_ID`
- `ARCADELINK_KV_RATE_LIMIT_ID`

`ARCADELINK_D1_PREVIEW_DATABASE_ID` is optional. `ARCADELINK_D1_DATABASE_ID` may be omitted only with `--local`, which uses Wrangler's zero UUID for the local D1 emulator. These build variables are used to generate `wrangler.generated.jsonc`; they are not Worker runtime variables.

Set these Worker secrets in Cloudflare:

- `SESSION_SECRET`
- `URL_ENCRYPTION_KEY`
- `TURNSTILE_SECRET_KEY`
- `MUNET_CLIENT_SECRET`

MuNET must allow both browser and native callbacks:

- `https://link.neri.moe/callback`
- `https://link.neri.moe/api/appclip/auth/callback`

The App Clip exchanges the native callback code at `/api/appclip/auth/exchange`; provider access and refresh tokens never pass through the App Clip URL.

Production deploys one Worker with Workers Assets:

- `https://link.neri.moe/` serves the React app from `dist/`.
- `https://link.neri.moe/api/*` runs the Worker API first.
