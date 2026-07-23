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

# 3. Copy the local env file (only needed for integration tests / local DB URLs)
cp .env.example .env.local
# Local DATABASE_URL should use the mise_app role — see .env.example

# 4. Start the local Supabase stack (the dev app logs in against it)
orbstack          # or open Docker Desktop
supabase start    # first run seeds the test user — see "Logging in locally" below
# Seed passwords only apply on fresh init / db reset. If integration tests fail
# with mise_app auth errors, run:
#   ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
#   MISE_APP_DB_PASSWORD=mise_app_local ALLOW_SHORT_MISE_APP_PASSWORD=1 \
#   npm run db:provision-app-role

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
| `npm run db:provision-app-role` | Set/rotate `mise_app` password (needs `ADMIN_DATABASE_URL` + `MISE_APP_DB_PASSWORD`) |
| `npm run mcp:dev` | Start the local Mise MCP server with Doppler `dev` config |
| `npm run mcp:serve` | Start the MCP process with environment variables supplied by the caller |

> **Why two build commands?** `build` is intentionally bare so it works where the Doppler
> CLI doesn't exist — Vercel and CI inject the same secrets their own way. On your laptop,
> use `build:local`, which wraps `next build` in `doppler run` to supply those secrets.

## ChatGPT app development

Mise also has an experimental MCP Apps surface for ChatGPT. Supabase OAuth 2.1 identifies
the connected Mise user. `get_kitchen_context` returns only that user's pantry and kitchen
tools in an inline widget, without row IDs. Narrow actions can set, consume, or restock the
structured quantity of one unambiguous existing item. They cannot create, rename, delete,
or convert units. A confirmed list can also consume/restock several existing structured
items in one all-or-nothing MCP action. Missing or ambiguous names, unsupported quantities,
stale expectations, and unsafe arithmetic leave the pantry unchanged; there is no generic
CRUD or implicit upsert tool.

Reviewed receipt additions use a separate backend command because they may mix
new-item creation with existing-item restocks. Every line must explicitly choose
`create` or `restock`; the whole 1–25 line request commits once or not at all. A
private user-scoped operation receipt makes identical retries effect-once and
rejects reuse of the same request ID for changed content. OCR/image extraction,
review UI, and MCP exposure remain separate later slices—model output never writes
directly to the pantry.

The hosted ChatGPT connector uses:

- MCP endpoint: `https://meal-prep-tawny-kappa.vercel.app/mcp`
- Health check: `https://meal-prep-tawny-kappa.vercel.app/api/mcp/health`
- Supabase Site URL: `https://meal-prep-tawny-kappa.vercel.app` (the application origin,
  without `/mcp`)

`MCP_PUBLIC_URL` is the canonical OAuth resource identifier and must equal the MCP
endpoint exactly. It lives in Doppler `prd`, which syncs it to Vercel.

For local development, run the same MCP app as a standalone process:

```bash
# Terminal 1: Next app (login + OAuth consent screen)
npm run dev

# Terminal 2: MCP server with widget rebuilds and local Supabase credentials
npm run mcp:dev

# Terminal 3: temporary public HTTPS tunnel for ChatGPT Developer Mode
ngrok http 8787
```

- Local MCP endpoint: `http://localhost:8787/mcp`
- MCP Inspector can connect directly to that local endpoint.
- Set `MCP_PUBLIC_URL` to the exact public MCP endpoint (for example,
  `https://example.ngrok.app/mcp`) before starting the MCP process. Discovery metadata
  and token validation use this as the connector's canonical resource identifier.
- ChatGPT Developer Mode connects to that same ngrok HTTPS URL with `/mcp` appended.
- Supabase OAuth Server must be enabled, with `/oauth/consent` as the authorization path
  and ChatGPT's exact connector callback URL registered/accepted by the OAuth client.
- ngrok forwards to this checkout; no commit or deployment is needed for local testing.
- Keep both processes running. If ngrok assigns a new URL, update the ChatGPT app.

For a real ChatGPT connection, the Supabase authorization server and consent page must be
publicly reachable: ChatGPT exchanges the authorization code from its own servers. The
stable dogfood path is the hosted Supabase project plus the deployed Mise web and MCP
routes. Use ngrok only when testing uncommitted MCP changes from the local checkout. Supply
the hosted Doppler config explicitly only when a test deliberately needs the hosted data:

```bash
MCP_PUBLIC_URL=https://example.ngrok.app/mcp \
  doppler run -c prd -- npm run mcp:serve
```

Do not use the hosted configuration for automated tests. Exercise write tools against local
fixtures first, then perform only the issue's named production dogfood action.

Use a fresh tool call to test new data. Historical ChatGPT messages retain their original
tool-result snapshot. Widget implementation and host-testing rules live in
[`src/mcp/AGENTS.md`](src/mcp/AGENTS.md).

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

If the worktree branch has new migrations, apply them to the local DB:

```bash
supabase db push --local
# if the test user is missing after a migration, re-seed:
supabase db reset
```

After setup, `npm run dev` works normally.

## Architecture

```
Browser (Next.js)          Server (API routes)         External
page.tsx                   /api/recipes/route.ts   →   Anthropic Claude
ChatWindow.tsx      →      auth.ts + db.ts         →   Supabase Postgres
                           ai.ts
```

All secrets live in [Doppler](https://dashboard.doppler.com) under the `meal-prep` project. `dev` config flows to local via CLI; `prd` config syncs to Vercel automatically.

## Contributing and security

Contributions are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md) for the issue,
priority, and pull-request workflow. Report suspected vulnerabilities privately by following
[SECURITY.md](SECURITY.md), not through a public issue.

## License

Mise is open source under the [MIT License](LICENSE).
