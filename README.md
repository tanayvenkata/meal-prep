# Mise — ChatGPT kitchen companion

Mise gives ChatGPT persistent, user-owned kitchen context through a focused MCP
tool surface. It stores pantry items and kitchen tools, supports safe inventory
changes, and keeps the data visible through a small Next.js account and kitchen
management site. Built with Next.js 16, Cloudflare Workers (Hono), Supabase Postgres/Auth, and the MCP TypeScript SDK v2.

Live web app: https://meal-prep-tawny-kappa.vercel.app
Live MCP edge endpoint: https://mise-mcp.tanayvenkata.workers.dev/mcp

## Getting started

### Prerequisites

- Node 24 LTS (shared by local development, CI, and Vercel)
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) — secrets manager (`brew install dopplerhq/cli/doppler`)
- [Vercel CLI](https://vercel.com/docs/cli) — deploy and manage Vercel from the terminal (`npm i -g vercel`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) — runs the local DB/auth stack the dev app logs into, and the integration tests (`brew install supabase/tap/supabase`)
- [OrbStack](https://orbstack.dev/) or Docker — required to run Supabase locally

### Setup

```bash
# 1. Install dependencies
pnpm install

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
#   pnpm run db:provision-app-role

# 5. Start the dev server
pnpm dev
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
in, use the Pantry and Tools pages to inspect or correct the kitchen data ChatGPT sees.

## Commands
 
| Command | What it does |
|---|---|
| `pnpm dev` | Start Next.js dev server (Doppler injects secrets) |
| `pnpm run build` | Production build (bare — no secrets; Vercel/CI inject their own) |
| `pnpm run build:local` | Production build on your laptop (Doppler injects secrets) |
| `pnpm run lint` | Lint |
| `pnpm test` | All tests in watch mode |
| `pnpm run test:unit` | Unit tests only (no Supabase needed) |
| `pnpm run test:integration` | DB integration tests (requires `supabase start`) |
| `pnpm run test:related` | Run only tests affected by changed files (fast agent feedback) |
| `pnpm run db:provision-app-role` | Set/rotate `mise_app` password (needs `ADMIN_DATABASE_URL` + `MISE_APP_DB_PASSWORD`) |
| `pnpm run mcp:worker` | Start local Cloudflare Workers Miniflare simulation with Hono (`wrangler dev`) |
| `pnpm run deploy:worker` | Deploy Hono MCP server to Cloudflare Workers (`wrangler deploy`) |
| `pnpm run mcp:dev` | Start local standalone Node/Express MCP server with Doppler `dev` config |
| `pnpm run mcp:serve` | Start MCP standalone process with environment variables supplied by caller |
 
> **Why two build commands?** `build` is intentionally bare so it works where the Doppler
> CLI doesn't exist — Vercel and CI inject the same secrets their own way. On your laptop,
> use `build:local`, which wraps `next build` in `doppler run` to supply those secrets.

## Primary product: ChatGPT MCP app

ChatGPT is Mise's primary conversational surface. Supabase OAuth 2.1 identifies
the connected Mise user. Mise exposes a focused **four-tool composable surface**
built on MCP TypeScript SDK v2:

1. `read_kitchen`: Returns the user's pantry items and kitchen tools with stable IDs,
   canonical structured quantities (`amount` + `unit` or `count`), custom text estimates,
   and turnover metadata.
2. `add_items`: Atomic batch creation and restock for pantry items and equipment.
   Supports caller-generated UUIDs for effect-once idempotency. Grocery runs and receipt
   scans are resolved by ChatGPT into a single atomic `add_items` batch without needing
   a dedicated receipt or OCR tool.
3. `edit_items`: In-place updates to quantities, units, and notes. Requires a stable
   resource ID and matching current display name so stale model context fails closed.
4. `remove_items`: Explicit removal for consumed, discarded, or used-up items with
   stale-name safety checks.

Missing or foreign IDs, duplicate names, unsupported quantities, stale expectations, and
unsafe arithmetic leave the kitchen completely unchanged. There is no raw database CRUD,
and no MCP access to chat history or credentials.

### Production and Edge Architecture

Mise decouples MCP execution from Next.js serverless to deliver sub-100ms response times
at the edge:

- **Edge MCP Server (Cloudflare Workers + Hono)**:
  - Endpoint: `https://mise-mcp.tanayvenkata.workers.dev/mcp`
  - Health check: `https://mise-mcp.tanayvenkata.workers.dev/health`
  - RFC 8414 OAuth discovery: `/.well-known/oauth-protected-resource`
  - Background telemetry: Flushes OpenTelemetry spans asynchronously via `waitUntil` without blocking ChatGPT tool execution.
- **Web Control Plane (Next.js on Vercel)**:
  - Web application: `https://meal-prep-tawny-kappa.vercel.app`
  - OAuth authorization & consent: `/oauth/consent`
  - Supabase Site URL: `https://meal-prep-tawny-kappa.vercel.app` (application origin)
  - Fallback serverless MCP handler: `/mcp`

`MCP_PUBLIC_URL` is the canonical OAuth resource identifier and matches the public MCP endpoint.

### Local development

For local development, you can run the MCP app either as a Cloudflare Workers edge simulation or as a standalone process:

```bash
# Terminal 1: Next app (login + OAuth consent screen)
pnpm dev

# Terminal 2: Edge MCP server (Miniflare simulation)
pnpm run mcp:worker
# Or run the standalone Node/Express server:
# pnpm run mcp:dev

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
  doppler run -c prd -- pnpm run mcp:serve
```

Do not use the hosted configuration for automated tests. Exercise write tools against local
fixtures first, then perform only the issue's named production dogfood action.

Use a fresh tool call to test new data. Historical ChatGPT messages retain their original
tool-result snapshot. MCP implementation and host-testing rules live in
[`src/mcp/AGENTS.md`](src/mcp/AGENTS.md).

## Supporting website

The website has a deliberately narrow role:

- During ChatGPT account linking, `/oauth/consent` sends an unauthenticated user to
  `/login`. That page can create a Mise account or sign into an existing one, then return
  to the pending consent request.
- `/pantry` and `/tools` provide a direct way to inspect and correct the same kitchen data
  exposed through MCP.
- `/mcp`, the OAuth metadata routes, and the health endpoint host the production
  integration.

There is no separate website chat or conversation history. ChatGPT owns that experience.

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
pnpm install
```

Supabase does NOT need to be restarted — it's one Docker container shared across all worktrees. Just make sure it's running (`supabase start` from any directory if not already up).

If the worktree branch has new migrations, apply them to the local DB:

```bash
supabase db push --local
# if the test user is missing after a migration, re-seed:
supabase db reset
```

After setup, `pnpm dev` works normally.

## Architecture

```
ChatGPT                    Mise server                  Storage
MCP tool call       →      /mcp route            →      kitchen-service.ts
OAuth bearer token        MCP auth + schemas            db.ts → Supabase

Browser                    Mise server
account/kitchen UI  →      auth + website APIs    →      same kitchen service
```

The website is a supporting control surface for sign-up/sign-in, OAuth consent, and direct
kitchen-data inspection or correction. New conversational product work belongs in the
ChatGPT MCP flow unless a browser-only need is demonstrated.

All secrets live in [Doppler](https://dashboard.doppler.com) under the `meal-prep` project. `dev` config flows to local via CLI; `prd` config syncs to Vercel automatically.

## Contributing and security

Contributions are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md) for the issue,
priority, and pull-request workflow. Report suspected vulnerabilities privately by following
[SECURITY.md](SECURITY.md), not through a public issue.

## License

Mise is open source under the [MIT License](LICENSE).
