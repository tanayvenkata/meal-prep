# Mise — Project Brief & Learning Log

> **Before any issue or PR, follow `CONTRIBUTING.md`** — `type:` label on the issue,
> priority as a board *field* on the Mise Board (not a label), three-part issue body
> (Context / What to do / Done when), `Closes #N` on PRs. The backlog lives in **GitHub
> Issues + the Mise Board**, not this file.

> This file is the project's durable memory: **what we're
> building, where we are, and WHY.** The "why" is the point — this is a learning project,
> and the goal is for the human to *articulate every choice*. Finished detail lives in git;
> this file keeps the live state + the transferable principles.
>
> **Each fact has one home:** *what* the app is + how to set up & run it → `README.md`;
> *how we work* (issues, PRs, priority) → `CONTRIBUTING.md`; the **backlog** → GitHub Issues
> + the Mise Board; the *why* + current state → here.

## Who this is for / how to work

- The human is a **capable beginner**: has coded small projects, but never built a real
  end-to-end full-stack app. Just starting on DSA and system design. Strong background in
  **finance**; comfortable cooking.
- **TEACH, don't blitz.** Explain the *why* before the *how*. Prefer understanding over
  speed — go slowly, build small, explain each piece.
- When we hit a "now we need X" moment, capture the *why* (in chat, the commit, or here)
  so the human accumulates a personal record of how the architecture grew.

## The vision (eventual)

A personal cooking app: stores my pantry, lets me add to it (eventually via a photo of a
receipt), and suggests recipes based on what I have, my mood, and my time — like chatting
with an assistant that has persistent memory of my kitchen. Stretch: voice / hands-free cooking.
**Learning project first, product second.** 

## Current state

- **Done: M1–M6.5 + pre-M7 hardening.** Streaming chat → Vercel deploy → pantry CRUD →
  pantry-aware recipes → auth → tests + CI/CD → voice → Mise redesign; plus rate limiting
  and a stop button. (Per-milestone detail: git history.)
- **Experimental ChatGPT surface:** a Streamable HTTP MCP server exposes
  `get_kitchen_context`, its read-only MCP Apps widget, and narrow exact-set, consume, and
  restock actions for unambiguous existing items. Supabase OAuth 2.1 maps the connector
  token to a Mise user; every tool uses the same user-scoped kitchen service as the
  website. General write actions cannot create, rename, delete, or convert units. A reviewed
  multi-item consume/restock list can use one all-or-nothing batch action; there is no
  generic CRUD or implicit upsert tool. A separately confirmed receipt proposal can call
  one idempotent atomic action whose lines explicitly choose new-item creation or an
  existing-item restock; the image or draft proposal never authorizes that call. The
  complete tool → resource → widget handshake works
  in MCP Inspector and ChatGPT Developer Mode, including light and dark themes. End-to-end
  account linking was first proven through the ngrok development connector. The same
  deliberately stateless server now also runs through the existing Vercel app at `/mcp`;
  ngrok remains the loop for uncommitted local changes.
- **What's next** lives on the Mise Board (sort by the Priority field), not here — M7 (OCR),
  the nav-model change, history, and gamification are all tracked issues.
- **Deployed:** https://meal-prep-tawny-kappa.vercel.app — auto-deploys on push to `main`.
- **Open source:** https://github.com/tanayvenkata/meal-prep is an MIT-licensed learning
  and portfolio project. Others may use, modify, and redistribute the owned source under
  the license terms; dependencies retain their own licenses.

**The two live loops:**
- **Chat:** `page.tsx` → `ChatWindow.tsx` → `api/chat/route.ts` → `ratelimit.ts` →
  `db.ts` + `ai.ts` → Anthropic (streamed back, abortable).
- **Pantry:** `pantry/page.tsx` → browser-only `pantry-api.ts` →
  `api/pantry/route.ts` → `kitchen-service.ts` → `db.ts` → Supabase.

**Experimental third loop:**
- **ChatGPT app:** ChatGPT → hosted Next `/mcp` route → `src/mcp/server.ts` →
  authenticated read or exact-quantity action → `kitchen-service.ts`; reads may continue
  through the MCP Apps resource → inline React widget. Local development uses ngrok as an
  HTTPS tunnel to the standalone process on port `8787`; production uses a short-lived
  Web-standard MCP transport per Vercel request.

Cross-cutting: `auth.ts` `getRequestAuth()` verifies the JWT and preserves OAuth client
identity for every user-scoped route; `middleware.ts` gates all routes except `/login`.
Design = Mise system
(`design_handoff/STATUS.md` tracks built vs. deferred screens).

## Architecture (the lightweight system design)

```
   BROWSER (frontend)          SERVER (backend)              ANTHROPIC
   src/app/page.tsx            src/app/api/chat/route.ts     Anthropic
   - ChatWindow component      - fetches pantry from DB      - the model
   - message list              - builds system prompt
   - pill input bar            - holds the SECRET api key
        |  POST /api/chat             |  stream                    |
        | ------------------------>  | -----------------------> |
        | <------ stream tokens ---- | <----- stream tokens ----|
```

- **Why a server step at all?** The API key must NEVER reach the browser (readable in dev
  tools). The backend is the only place the key lives.
- **Why Next.js?** Frontend AND backend in one project (`page.tsx` = browser,
  `api/.../route.ts` = server) — no juggling two repos while learning.

## Tech stack

- **Next.js 16 (App Router) + TypeScript + Tailwind** — via `create-next-app`.
- **AI: native Anthropic SDK**, behind `src/lib/ai.ts`.
- **DB: Postgres via Supabase**, behind `src/lib/db.ts` (raw SQL via `postgres` driver).
- **Auth: Supabase Auth** (`@supabase/ssr`, cookie sessions). **Secrets: Doppler.**
  **Rate limiting: Upstash Redis.** Dev runs Node 26 / npm 11; supported floor is
  Node 22+ (README) — Next.js 16 itself needs ≥20.9.

## Principles (the transferable "why" — these guide every decision)

These are what the per-milestone decisions all reduced to. Specifics for any shipped choice
are in git (commits + PRs); these are the patterns worth carrying to the next project.

- **Defer capability until the need is real; structure so adding it is cheap.** The unifying
  rule. Postgres waited until state vanished on refresh; auth waited until there were users;
  Doppler waited until secrets crossed ~4; RLS waited until users existed. Each was felt as
  a pain *first*, then added — never speculatively.
- **One boundary file per external dependency.** `ai.ts` (the model), `db.ts` (the DB +
  connection string + driver), `auth.ts` (JWT → userId), `ratelimit.ts` (Upstash). Swapping
  a vendor = editing one file. The secret only ever lives behind its boundary, server-side.
- **The secret/logic boundary is server-side, always.** API key, system prompt, SQL —
  built and held in the route, never sent to the browser. Same principle from M1's chat to
  M4's recipe prompt.
- **Learn the fundamental, not the abstraction.** Raw SQL not an ORM; our own `/api/pantry`
  not browser→DB-direct via supabase-js. More code, but the *transferable* kind — reach for
  the abstraction later, once you can read what it generates and choose it on purpose.
- **Extract when the duplication is logic, not just a shared import.** `ChatWindow`, `db.ts`,
  `auth.ts`, and `kitchen-service.ts` were extracted when real behavior needed another
  caller. The kitchen service now gives website and MCP transports one home for normalized
  pantry/tool operations without becoming a second SQL layer.
- **DB is the source of truth; the screen mirrors it.** Re-fetch after every change rather
  than tracking local state. Optimise to optimistic/cached only when lag is actually felt.
- **User-facing identity rules belong in the database.** Pantry items and kitchen tools
  preserve the display name a user entered, while one shared Unicode-normalized canonical
  key prevents same-user duplicates under concurrent website or future agent requests.
  Tool kinds are the explicit V1 set (`appliance`, `cookware`, `bakeware`), and tool
  update/delete commands distinguish a real change from unchanged, missing, or conflicting
  state instead of reporting success by default.
- **Each layer tests itself and mocks everything below.** Route tests mock service + auth;
  kitchen-service tests mock DB functions; DB tests hit real local Postgres. No overlap —
  routes prove transport behavior, the service proves normalization/orchestration, and DB
  tests prove SQL. User-isolation is tested explicitly on write ops that take a row id.
  Frontend behavior tests live under `src/__tests__/components`, opt into jsdom with the
  Vitest environment comment, and use Testing Library queries to prove user-visible states
  rather than CSS or layout details.
- **Retry safety belongs to the mutation boundary.** Fresh expected quantities prevent
  immediate duplicate adjustments, but asynchronous receipt/import confirmation needs a
  durable operation identity. Reviewed receipt additions therefore store only a private
  user-scoped request fingerprint and terminal result in the same transaction as the
  pantry changes. This is effect-once command evidence, not a general inventory history
  ledger or permission for OCR/model output to mutate data directly.
- **Defense in depth for process.** Husky pre-commit (lint) + pre-push (build + unit tests)
  catch errors before CI does; CI re-checks remotely; the default-branch ruleset requires
  the PR + CI path, while `.husky/pre-push` gives immediate local feedback.
- **Security sequenced to when it's real, not skipped.** Each gap is a *deliberate* deferral
  with a named trigger, written down — not drift.

## Known facts that change a decision (NOT a backlog — that's GitHub Issues + the Mise Board)

The open-work list lives on the board, not here, so it can't drift. This section holds only
the few non-obvious *facts about the current system* that would make me write wrong code if I
didn't know them — the architectural truths a tracker title can't carry.

- 🔐 **RLS is a real second authorization layer.** The application pool connects as the
  non-owner, `NOBYPASSRLS`, `NOINHERIT` `mise_app` role and enters the authenticated role
  only inside `withUserContext`, which stamps the trusted user ID for ownership policies.
  Explicit application predicates remain the first layer. Supabase OAuth tokens carry a
  `client_id`; direct OAuth/Data API access is limited to owned pantry/tool reads and cannot
  mutate kitchen rows or access chat tables. Mise's own website APIs preserve that client
  identity and reject OAuth clients outside the same read-only website-API boundary.
  The MCP server may expose a separately reviewed narrow action through the authenticated
  kitchen service without widening direct OAuth/Data API permissions.
- ⚠️ **Local dev ↔ prod are isolated by Doppler, but staging is NOT.** The `dev` config points
  the running app at the LOCAL Supabase stack (`127.0.0.1`); `prd` is prod. BUT `dev`/`stg`/
  `prd` ALL share the same prod DB at the cloud level — so a Vercel Preview reads/writes PROD.
  Don't treat a Preview as a sandbox. **Mental model + the staging build plan:
  `docs/environments.md`.**
- 🔧 **Dev session ritual:** OrbStack → `supabase start` → `npm run dev`. Skipping
  `supabase start` → `ECONNREFUSED 127.0.0.1:54322` (the dev app and the db tests both need
  the local stack up).
- 🔐 **The MCP surface is authenticated at the HTTP transport boundary.** Supabase OAuth 2.1 access
  tokens are checked for signature, issuer, audience, expiry, client identity, role, and
  scope before the MCP server exposes tools or resources and before `sub` becomes the
  database user ID. The MCP SDK owns the Express shell, OAuth metadata routes, bearer parsing,
  and scope/expiry middleware; Mise owns the Supabase-specific claim policy. Missing or
  invalid credentials receive HTTP 401 with the MCP OAuth discovery challenge. The tool also
  keeps its own auth declaration and challenge as defense in depth. Supabase's standard OAuth
  scopes control OIDC identity data rather than database permissions, so RLS and Mise's API
  auth boundary independently enforce the connection's kitchen capability. Direct token and
  website API access remains read-only for OAuth clients; narrow MCP write actions route
  through server-side kitchen commands with exact schemas, annotations, match policies,
  and regression tests. An ngrok URL remains public reachability, not authentication.

## Commands & setup

Full setup, prerequisites, and the everyday command table live in **`README.md`** — not
repeated here. The non-obvious bits worth knowing in-session:

- **Tests:** `npm run test:unit` (mock-based, no infra) / `npm run test:integration` (db
  tests, needs `supabase start`) / `npm test -- --run` (all once).
- **Secrets (Doppler):** all live in Doppler (`dev` → local CLI, `prd` → Vercel sync); add a
  secret once → flows everywhere. `.env.local` can hold local-only DB URLs
  (`DATABASE_URL` as `mise_app`, `ADMIN_DATABASE_URL` as owner for rare ops).
- **DB login role:** app pool = `mise_app` (NOBYPASSRLS, non-owner). Provision hosted
  passwords with `npm run db:provision-app-role`; never point the app at owner `postgres`.
- **Schema change:** `supabase db pull` (remote → migrations) / `supabase db push`
  (migrations → remote).
