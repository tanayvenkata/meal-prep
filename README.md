# Mise — meal prep assistant

Pantry-aware recipe chat powered by Claude. Built with Next.js 16, Supabase, and the Anthropic SDK.

Live: https://meal-prep-tawny-kappa.vercel.app

## Getting started

### Prerequisites

- Node 22+ (Next.js 16 needs ≥20.9; we develop on 26)
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) — secrets manager (`brew install dopplerhq/cli/doppler`)
- [Vercel CLI](https://vercel.com/docs/cli) — deploy and manage Vercel from the terminal (`npm i -g vercel`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) — runs the local DB/auth stack the dev app logs into, and the integration tests (`brew install supabase/tap/supabase`)
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

# 4. Start the local Supabase stack (the dev app logs in against it)
orbstack          # or open Docker Desktop
supabase start    # first run seeds the test user — see "Logging in locally" below

# 5. Start the dev server
npm run dev
```

The dev app authenticates against your **local** Supabase stack (the Doppler `dev`
config points it at `127.0.0.1`), so `supabase start` must be running before you can
log in — see [Logging in locally](#logging-in-locally).

### Logging in locally

The dev app signs in against the **local** Supabase stack (not prod — the Doppler `dev`
config points it at `127.0.0.1`). A test user is seeded so the running app is usable
immediately:

| Email | Password |
|---|---|
| `test@local.dev` | `password123` |

The user (and a few sample pantry items) come from [`supabase/seed.sql`](supabase/seed.sql),
which runs automatically when the local stack **first initializes** — so a fresh
`supabase start` already has it. You don't need to read `seed.sql` to log in.

**If login fails with `invalid_credentials`** even though `supabase start` is running,
your stack predates the current seed (the seed only runs on a *fresh* init, not on every
`start`). Re-seed by resetting the local DB:

```bash
supabase db reset   # re-runs migrations + seed.sql against the local stack
```

Then log in again — the test user is recreated with a matching password hash. Once logged
in, send a message in the chat to get a recipe reply.

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

## Working in git worktrees

Worktrees are separate directories for feature branches (created via `git worktree add`). Two things need re-linking when you first `cd` into one:

```bash
# 1. Link Doppler — scoped to the main repo path, not inherited by worktrees
doppler setup --project meal-prep --config dev

# 2. Install node_modules — not shared between worktrees
npm install
```

Supabase does NOT need to be restarted — it's one Docker container shared across all worktrees. Just make sure it's running (`supabase start` from any directory if not already up).

After setup, `npm run dev` works normally.

## Architecture

```
Browser (Next.js)          Server (API routes)         External
page.tsx                   /api/recipes/route.ts   →   Anthropic Claude
ChatWindow.tsx      →      auth.ts + db.ts         →   Supabase Postgres
                           ai.ts
```

All secrets live in [Doppler](https://dashboard.doppler.com) under the `meal-prep` project. `dev` config flows to local via CLI; `prd` config syncs to Vercel automatically.
