# Mise — meal prep assistant

Pantry-aware recipe chat powered by Claude. Built with Next.js 16, Supabase, and the Anthropic SDK.

Live: https://meal-prep-tawny-kappa.vercel.app

## Getting started

### Prerequisites

- Node 22+
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) — secrets manager (`brew install dopplerhq/cli/doppler`)
- [Vercel CLI](https://vercel.com/docs/cli) — deploy and manage Vercel from the terminal (`npm i -g vercel`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) — for integration tests only (`brew install supabase/tap/supabase`)
- [OrbStack](https://orbstack.dev/) or Docker — required to run Supabase locally

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Authenticate with Doppler and link to this project
doppler login
doppler setup   # select: meal-prep → dev

# 3. Copy the local env file (only needed for integration tests)
cp .env.example .env.local
# Fill in TEST_DATABASE_URL — see .env.example for instructions

# 4. Start the dev server
npm run dev
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server (Doppler injects secrets) |
| `npm run build` | Production build (bare — no secrets; Vercel/CI inject their own) |
| `npm run build:local` | Production build on your laptop (Doppler injects secrets) |
| `npm run lint` | Lint |
| `npm test` | All tests in watch mode |
| `npm run test:unit` | Unit tests only (no Supabase needed) |
| `npm run test:integration` | DB integration tests (requires `supabase start`) |

> **Why two build commands?** `build` is intentionally bare so it works where the Doppler
> CLI doesn't exist — Vercel and CI inject the same secrets their own way. On your laptop,
> use `build:local`, which wraps `next build` in `doppler run` to supply those secrets.

### Before running integration tests

```bash
# Once per dev session
orbstack          # or open Docker Desktop
supabase start
```

## Architecture

```
Browser (Next.js)          Server (API routes)         External
page.tsx                   /api/recipes/route.ts   →   Anthropic Claude
ChatWindow.tsx      →      auth.ts + db.ts         →   Supabase Postgres
                           ai.ts
```

All secrets live in [Doppler](https://dashboard.doppler.com) under the `meal-prep` project. `dev` config flows to local via CLI; `prd` config syncs to Vercel automatically.
