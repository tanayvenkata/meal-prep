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
- **Experimental ChatGPT surface:** a Streamable HTTP MCP server exposes one read-only
  `get_kitchen_context` tool and an MCP Apps widget. Supabase OAuth 2.1 maps the connector
  token to a Mise user; the tool then reads only that user's pantry and kitchen tools
  through the existing user-scoped database boundary. The complete tool → resource → widget
  handshake works in MCP Inspector and ChatGPT Developer Mode, including light and dark
  themes. End-to-end account linking has been proven through the ngrok development connector;
  durable MCP hosting and database RLS hardening remain separate follow-up boundaries.
- **What's next** lives on the Mise Board (sort by the Priority field), not here — M7 (OCR),
  the nav-model change, history, and gamification are all tracked issues.
- **Deployed:** https://meal-prep-tawny-kappa.vercel.app — auto-deploys on push to `main`.
- **Open source:** https://github.com/tanayvenkata/meal-prep is an MIT-licensed learning
  and portfolio project. Others may use, modify, and redistribute the owned source under
  the license terms; dependencies retain their own licenses.

**The two live loops:**
- **Chat:** `page.tsx` → `ChatWindow.tsx` → `api/chat/route.ts` → `ratelimit.ts` →
  `db.ts` + `ai.ts` → Anthropic (streamed back, abortable).
- **Pantry:** `pantry/page.tsx` → `api/pantry/route.ts` → `db.ts` → Supabase.

**Experimental third loop:**
- **ChatGPT app:** ChatGPT → HTTPS MCP endpoint → `src/mcp/server.ts` →
  `get_kitchen_context` → MCP Apps resource → inline React widget. Local development uses
  ngrok only as an HTTPS tunnel to port `8787`; the laptop remains the server.

Cross-cutting: `auth.ts` `getUserId()` puts a JWT check on every user-scoped route;
`middleware.ts` gates all routes except `/login`. Design = Mise system
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
  `auth.ts` were all extracted at the Rule of Three, when real logic repeated.
- **DB is the source of truth; the screen mirrors it.** Re-fetch after every change rather
  than tracking local state. Optimise to optimistic/cached only when lag is actually felt.
- **Each layer tests itself and mocks everything below.** Route tests mock db + auth; db
  tests hit real local Postgres. No overlap — route tests prove route logic, db tests prove
  the SQL. Three zones per endpoint (auth gate / input validation / happy path) = one test
  per branch. User-isolation tested explicitly on write ops that take a row id.
- **Defense in depth for process.** Husky pre-commit (lint) + pre-push (build + unit tests)
  catch errors before CI does; CI re-checks remotely; the default-branch ruleset requires
  the PR + CI path, while `.husky/pre-push` gives immediate local feedback.
- **Security sequenced to when it's real, not skipped.** Each gap is a *deliberate* deferral
  with a named trigger, written down — not drift.

## Known facts that change a decision (NOT a backlog — that's GitHub Issues + the Mise Board)

The open-work list lives on the board, not here, so it can't drift. This section holds only
the few non-obvious *facts about the current system* that would make me write wrong code if I
didn't know them — the architectural truths a tracker title can't carry.

- ⚠️ **RLS is NOT real defense.** `items` has `enable row level security` but **no policies
  and no `force`**, and `db.ts` connects as table owner (pooler) → RLS is **bypassed**. User
  isolation is therefore ONE layer: the explicit `where user_id = $userId` in every query
  (present + tested). Don't trust RLS as a guard. (Fix tracked on the board; hardening is
  optional for one user, required before multi-user.)
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
  keeps its own auth declaration and challenge as defense in depth. An ngrok URL remains
  public reachability, not authentication.

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
