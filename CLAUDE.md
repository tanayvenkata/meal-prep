# Meal-Prep App — Project Brief & Learning Log

> Framework rules from create-next-app live in AGENTS.md — imported here so they stay
> active. KEY ONE: this is Next.js 16, with breaking changes vs. older versions — read
> `node_modules/next/dist/docs/` before writing Next.js code, don't trust memory.
@AGENTS.md


> This file is the memory of the project. It is read at the start of every session.
> It captures **what we're building, where we are, and — most importantly — WHY each
> decision was made.** The "why" is the point: this is a learning project, and the goal
> is for the human to be able to *articulate every choice*, not just have working code.

## Who this is for / how to work

- The human is a capable beginner: has coded and built small projects, but has **never
  built a real end-to-end full-stack app.** Just starting on DSA and system design.
- Strong subject-matter background in **finance**; comfortable cooking.
- **TEACH, don't blitz.** Explain the *why* before the *how*. Prefer understanding over
  speed. It is fine — encouraged — to go slowly, build small, and explain each piece.
- When we hit a "now we need X" moment, write it down in the Decision Log below so the
  human accumulates a personal record of *why* the architecture grew the way it did.

## The vision (eventual)

A personal cooking app: stores my pantry/ingredients, lets me add more (eventually via a
photo of a receipt), and suggests recipes based on what I have, what I'm in the mood for,
and how much time I have — like chatting with Claude, but with persistent memory of my
kitchen. Stretch goals: voice / speech-to-text for hands-free cooking. (A separate
finance-tracker app may come later as project #2 — kept separate on purpose.)

This is a **learning project first, product second.** Not trying to make money.

## Milestone roadmap (build small, ship each one)

- [x] **M1 — Streaming chat clone.** DONE. Text box → send → Claude streams back live.
      Full loop working: browser → /api/chat → ai.ts → Claude → streamed to screen.
- [x] **M2 — Deploy to Vercel.** DONE. Live at https://meal-prep-tawny-kappa.vercel.app —
      same `curl -N` from M1 works against the public URL. Public deploy pipeline proven.
- [x] **M3 — Pantry CRUD.** DONE + DEPLOYED. Add/edit/delete ingredients, persisted in
      Supabase Postgres. Full loop: /pantry page → fetch → /api/pantry route → db.ts boundary
      → postgres driver → Supabase. Survives refresh; verified live (curl'd CRUD against the
      prod URL). `DATABASE_URL` set in Vercel for Production + Preview. *Postgres earned its
      place* (we felt state vanish on refresh first, then added the DB).
      ⚠️ **Known open door (deliberate, fix at M5):** `/api/pantry` has NO auth — anyone with
      the URL can add/delete items. The SECRET (DATABASE_URL) is safe (server-only, Pattern A);
      only the *data* is unprotected. Low risk now (random unshared URL, trivial stakes,
      single-user). A stopgap was deliberately NOT added (throwaway once M5 lands).
- [x] **M4 — Recipe suggestions.** DONE + DEPLOYED. Pantry-aware chat at `/recipes` — fetches
      pantry from DB, injects as system prompt, streams Claude's response. Two halves joined.
      `src/components/ChatWindow.tsx` extracted to eliminate duplicate chat UI logic.
- [x] **M5 — Auth + per-user pantry.** DONE + DEPLOYED. Supabase Auth (email/password). Each
      user has their own pantry. JWT verified on every API request. RLS enabled on `items` table.
      `supabase.ts` boundary + `login/page.tsx` + `SignOutButton` in layout. M3 open door closed.
- [x] **M5.5 — Tests.** DONE. 32 tests across 6 files. Vitest.
      ✅ API route tests — pantry/recipes/chat, 3 zones each (auth gate, input validation, happy path)
      ✅ db.ts integration tests — real local Postgres, SQL correctness + user isolation
      ✅ auth.ts tests — 3 outcomes of getUserId (no token, valid token, token but no user)
      ✅ middleware tests — 3 branches (public route, unauthenticated, authenticated)
      ✅ helpers/fixtures.ts — shared fake data factories (Rule of Three)
      ⬜ Frontend component tests — deliberately skipped (components too thin, redundant with route tests)
      ⬜ E2E tests — deliberately skipped (app still evolving; add after M6)
- [x] **M5.6 — CI/CD + local hooks.** GitHub Actions on every push. Husky pre-commit (lint) + pre-push (build + unit tests). Testing pyramid: unit locally, integration in CI.
- [x] **M6 — Voice mode.** DONE + DEPLOYED. Mic button in `ChatWindow.tsx` toggles
      listening on/off via Web Speech API. Transcript lands in the input box; user reviews
      and sends manually (intentional — no accidental sends). Handles permission-denied,
      unsupported browsers, and WebKit start errors. No backend changes needed.
      `src/types/speech.d.ts` added for Web Speech API types.
- [x] **M6.5 — Mise visual redesign.** DONE + DEPLOYED. Adopted Mise design system from
      `design_handoff/` (generated via Claude Design). Warm color palette (Paper/Ink/Ember/Sand),
      Spectral serif wordmark, ink user bubbles + surface assistant bubbles, pill input bar,
      lucide icons (replaces emoji), sticky nav, loading skeleton on pantry, inline item editing
      (replaces `prompt()`), auto-scroll to latest message, scrollbar hidden on chat.
      `design_handoff/STATUS.md` tracks which of the 8 design screens are done vs deferred.
      General chat dropped — `/api/recipes` (pantry-aware) is now the only chat and the landing page.
      `updateItem` in `db.ts` extended to accept optional `name` so inline edit can rename ingredients.
      Deferred: pantry as sheet over chat, history drawer, pantry pill strip, typing indicator
      (all need nav model change or new backend — future milestones).
- [ ] **M7 — Receipt scanning (OCR).** Evaluate if it's worth it by now.

## Architecture (current — the lightweight system design)

```
   BROWSER (frontend)          SERVER (backend)              ANTHROPIC
   src/app/page.tsx            src/app/api/recipes/route.ts  Claude
   - ChatWindow component      - fetches pantry from DB      - the model
   - message list              - builds system prompt
   - pill input bar            - holds the SECRET api key
        |  POST /api/recipes         |  stream                    |
        | ------------------------>  | -----------------------> |
        | <------ stream tokens ---- | <----- stream tokens ----|
```

- **Why a server step at all?** The API key must NEVER reach the browser (anyone could
  read it in dev tools). The backend is the only place the key lives.
- **Why Next.js?** It gives us frontend AND backend in one project (`page.tsx` = browser,
  `api/.../route.ts` = server), so we don't juggle two repos while learning.

## Tech stack

- **Next.js (App Router) + TypeScript + Tailwind** — scaffolded via `create-next-app`.
- **AI: native Anthropic SDK**, isolated behind `src/lib/ai.ts` (see Decision Log).
- **Database: Postgres via Supabase** — *not yet*. Added at M3.
- Node 26, npm 11.

## Decisions so far (one line each — the "why" was discussed in chat when made)

- **Postgres deferred to M3** — nothing to persist until pantry CRUD exists.
- **Lightweight design now, not heavy** — single-user MVP; learn requirements by building.
- **Native Anthropic SDK, not OpenRouter** — behind `src/lib/ai.ts` boundary; swap later.
- **Prompt caching deferred to ~M4** — needs a big reused prefix (>=1,024 tok) to do anything.
- **No OpenTelemetry yet** — it monitors prod; we have none.
- **Secrets only in `.env.local`** (git-ignored); `.env.example` is the committed template.
- **Deployed on Vercel, not Railway** (M2) — brief's reasoning still held: Vercel is the
  verified Next.js adapter (zero build config), and the Vercel+Supabase pairing keeps the
  M3 DB decision cleanly deferred. Railway tooling being in-session wasn't a reason.
- **Env vars live per-platform, pasted manually** — `.env.local` for local, Vercel's
  encrypted store for prod. Same var name, two homes, neither in git. The manual paste
  IS the security feature (each copy is a deliberate, auditable act), not missing polish.
- **Secrets manager (Doppler/Infisical) deferred to ~M3–M5** — the "one source of truth,
  connectors sync from it" pattern the user asked about. Overhead for 1 secret in 2 places;
  earns its place once secrets cross ~4 across local + prod + preview (Supabase URL/keys + auth).
- **M3: Pattern A (own backend), not Pattern B (Supabase client in the browser)** — Supabase
  pushes browser→DB-direct via `supabase-js`+RLS. We chose browser→our `/api/pantry`→DB instead:
  it teaches the fundamentals (endpoints, the secret boundary, backend logic) and mirrors the
  M1 chat shape. Pattern B hides exactly what we're here to learn, and its guard (RLS) is off
  until M5 anyway. More code = more learning, and it's the transferable kind.
- **M3: raw SQL via `postgres` driver, not an ORM (Prisma/Drizzle)** — SQL is the forever,
  transferable skill; an ORM hides the SQL we're here to learn. Learn the fundamental deeply
  now; reach for an ORM later, once we can read the SQL it generates and choose it on purpose.
- **M3: `src/lib/db.ts` is THE DB boundary** — only file that imports the driver / knows the
  connection string. Mirrors `ai.ts`. Swap Supabase/driver/host = change this one file. Will
  split into a `db/` folder (connection + per-table files) when it outgrows one file, keeping
  the same principle. Same swappability reasoning as the `ai.ts` decision above.
- **M3: transaction-pooler connection string (port 6543), not direct connection** — direct is
  IPv6-only by default and would break on Vercel's serverless functions; the pooler is built
  for stateless/serverless and is the standard Next-on-Vercel + Postgres choice.
- **M3: RLS off, deferred to M5** — RLS distinguishes *users*, and there are none until auth.
  Turning it on now (no login) would lock us out of our own table. Security sequenced to when
  it's real, not skipped. `items` table: DB-generated `id` (bigint identity), `name not null`,
  `quantity` optional, `created_at` default now() — the DB owns ids (no more `Date.now()` hack).
- **M3: re-fetch the list after every change (DB = source of truth), not local state updates** —
  simplest, always-correct mental model: screen mirrors the DB. Optimize to local/optimistic
  updates only when a *concrete* pain appears (visible lag, cost at scale, a UX requirement).
- **M3: `next/link` for navigation, not `<a href>`** — `<Link>` does client-side transitions
  (no full reload, preserves React state) and prefetches. Home↔Pantry linked both ways.
- **M4: system prompt built in `/api/recipes`, not injected from the frontend** — the route
  fetches the pantry and builds the `system` string server-side on every request. Frontend never
  sees or touches the system prompt. Same "secrets/logic stay server-side" principle as M1.
- **M4: `/api/recipes` is a separate route, not a modification of `/api/chat`** — built in
  isolation first (bottom-up), then integrated via shared `ChatWindow` component. Same pattern
  real firms use: new feature separate → verify → merge/share.
- **M4: shared `ChatWindow` component, not duplicated page logic** — same principle as `db.ts`
  and `ai.ts`: extract when duplication is *logic*, not just when two files import the same thing.
  Pages are now just configuration (title, apiRoute, placeholder, links).
- **M4: pantry re-fetched on every message turn, not cached** — simple and correct for now.
  Optimization (cache the pantry for a session) deferred until lag is actually felt.
- **M4: UI polish deferred to after M5** — styling is cosmetic; auth changes the data model.
  Polish after the structure is stable.
- **Post-M5: switched to `@supabase/ssr`** — old `createClient` stored session in localStorage (server-blind);
  `createBrowserClient` stores in cookies so middleware can read the session on every request.
- **Post-M5: middleware.ts at project root** — gates all routes except `/login` before React renders;
  appends `?returnTo=` so login can redirect back to the original destination.
- **Post-M5: `src/lib/auth.ts` boundary** — `getUserId()` extracted from pantry+recipes routes; `/api/chat` now also requires JWT.
- **M3 known debt (deliberate, not drift):** pantry page uses inline `style={{}}` while the chat
  page uses Tailwind `className`. Cosmetic only, crosses no boundary — left for a later styling
  pass rather than churned mid-milestone. Also: front-end mutate() helper has no `res.ok` check
  yet (backend 400s are silently swallowed) — the natural next error-handling lesson.
- **M5.5: Vitest, not Jest** — near-identical API, but faster and native ESM support; standard for Next.js/Vite projects now.
- **M5.5: route tests mock db+auth, db tests hit real local DB** — each layer tests itself, mocks everything below. Route tests prove the route logic; db tests prove the SQL. No overlap.
- **M5.5: `src/__tests__/` mirrors `src/` structure** — no hunting; test file path = source file path, just under `__tests__/`.
- **M5.5: three zones per endpoint** — auth gate, input validation, happy path. One test per branch in the code.
- **M5.5: db tests use real local Postgres via Supabase CLI** — `supabase start` boots local stack; `beforeAll` creates test users, `afterEach` wipes items, `afterAll` cleans users. No mocks at the db layer.
- **M5.5: helpers/fixtures.ts for shared fake data** — extracted at Rule of Three (3 files reusing same Item shape). `vi.mock()` stays per-file (Vitest hoists it; can't be shared).
- **M5.5: user isolation tested explicitly on updateItem + deleteItem** — write ops that take a row id can silently affect another user's data if `and user_id = $userId` is missing. Read ops and insert ops don't have this risk.
- **M5.5: middleware tested by mocking `@supabase/ssr`** — same nested mock pattern as route tests; three branches: public route passthrough, unauthenticated redirect (with ?returnTo=), authenticated passthrough.
- **M5.5: auth.ts mock defined before vi.mock() factory** — `getSupabase()` creates a fresh `createClient()` on every call; defining `mockGetUser` outside the factory and referencing it inside ensures all calls share the same mock function.
- **M5.5: `npm test` = watch mode, `npm test -- --run` = run once** — watch mode for active development; --run for CI and one-off checks.
- **M5.5: frontend + E2E deliberately skipped** — components are thin wrappers around API calls (redundant with route tests); E2E better after app stabilizes post-M6.
- **M5.5→M6: GitHub Actions CI** — `.github/workflows/ci.yml`; triggers on every push + PR to main. Runs lint → build → all tests. Boots Supabase local stack in CI so db integration tests hit real Postgres. Ubuntu VM, Node 22, npm cache.
- **M5.5→M6: Husky pre-commit + pre-push hooks** — pre-commit runs lint only (~3s, every commit); pre-push runs build + 26 unit tests (~30s, no Supabase needed). Defense in depth: catch errors on your machine before CI sees them.
- **M5.5→M6: test:unit vs test:integration split** — `npm run test:unit` runs the 26 mock-based tests (no infrastructure); `npm run test:integration` runs the 6 db tests (needs `supabase start`). pre-push uses test:unit so it works without Supabase running locally.
- **M5.5→M6: branch protection deferred** — requires GitHub Team plan for private repos. pre-push hook is the local gate; CI is the remote gate. Branch protection is the repo-level enforcement layer — add when repo goes public or plan upgrades.
- **Post-env-session: `.husky/pre-push` blocks direct pushes to `main`** — confirmed server-side rulesets/branch protection are Pro-or-public only (private+free repo can't use them; verified via API 403). So the local pre-push hook aborts if on `main`, enforcing PR-first as a solo-dev habit (PR = our review/preview gate). Local-only, bypassable with `--no-verify`. Upgrade to a server-side ruleset when the repo goes public or hits Pro.
- **M6: Web Speech API, not a third-party service** — free, in-browser, no backend needed. Transcript-then-send (not auto-send) was intentional: gives user a review step before the message goes to Claude. No accidental sends mid-sentence.
- **M6: `src/types/speech.d.ts` for Web Speech API types** — the Web Speech API isn't in TypeScript's default lib; a small `.d.ts` shim is the standard fix rather than casting to `any` everywhere.
- **Post-M6: JSON error bodies on all routes** — `Response.json({ error: "..." }, { status })` instead of `new Response("text", { status })`. Frontend can always call `res.json()` without throwing; status codes remain correct for API consumers.
- **Post-M6: frontend checks `res.status` before `res.json()`** — explicit status-code handling in `ChatWindow.tsx` means the user sees "Session expired — please sign in again" on a 401 instead of a raw parse error crashing silently.
- **M6.5: Mise design system adopted from Claude Design handoff** — warm palette (Paper/Ink/Ember/Sand), Spectral serif wordmark, mobile-first visual language adapted for desktop column. Design files committed to `design_handoff/`; `STATUS.md` is the living tracker.
- **M6.5: Mise visual style adapted to desktop, not pixel-faithful phone layout** — the handoff is phone mockups (390px); we adopted the visual language (colors, fonts, shapes) within the existing `max-w-2xl` centered column so it works on both laptop and mobile without a responsive rabbit hole.
- **M6.5: `design_handoff/` committed to repo, excluded from ESLint** — design artifacts are documentation; they answer "why does it look like this?" for future sessions. `support.js` is a third-party Claude Design runtime, excluded via `eslint.config.mjs` globalIgnores.
- **M6.5: color discipline — ember appears once per screen** — ember (`#c8492f`) is the primary action only (send button, Add button, CTA). User bubbles are ink (`#221d18`), not ember. Avoids visual noise; follows the spec's "one accent per screen" rule.
- **M6.5: `scrollbar-hide` utility in globals.css** — hides the scrollbar track on the chat message div. Mobile browsers already hide scrollbars; desktop browsers show a permanent track by default. Two CSS rules (`scrollbar-width: none` for Firefox, `::-webkit-scrollbar { display: none }` for Chrome/Safari) handle both. Not a plugin — 2 lines of CSS.
- **M6.5: `min-h-0` on the message list div** — flex children default to `min-height: auto`, meaning they grow to fit content and never scroll. `min-h-0` overrides this so the div can shrink below its content size and `overflow-y-auto` actually kicks in.
- **M6.5: inline edit replaces `prompt()`** — `prompt()` is an unstyled browser dialog from the 90s; can't be styled, freezes the tab, off-brand. Inline edit row (controlled state: `editingId`, `editName`, `editQuantity`) is the standard pattern in real apps.
- **M6.5: `updateItem` extended to accept optional `name`** — previously only updated quantity. Optional parameter is backwards-compatible; existing tests didn't change, new integration test added for the name-update branch.
- **M6.5: lucide-react for icons, not emoji** — design spec says no emoji in product UI. `lucide-react` provides feather-style line icons at stroke ~2.2, matching the spec. `Mic` icon background color (ember vs pantry-strip) signals recording state — not the icon itself switching to `MicOff`.
- **Pre-M7: Doppler as secrets manager** — crossed the ~4 secrets threshold predicted in the decision log. Doppler `dev` → local CLI, `prd` → Vercel sync integration. `.env.local` reduced to `TEST_DATABASE_URL` only (local Supabase, meaningless outside this machine). `.env.example` updated to document Doppler as source of truth. One paste to add any new secret; flows everywhere automatically.
- **Pre-M7: Upstash Redis rate limiting on `/api/recipes`** — sliding window 10 req/60s per user via `@upstash/ratelimit` + `@upstash/redis`. `src/lib/ratelimit.ts` is the boundary; route returns 429 on limit exceeded; `ChatWindow.tsx` shows a friendly message. Credentials (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) live in Doppler. Closes the rate-limiting security debt item.
- **Pre-M7: stop button + Escape key to abort streaming** — `AbortController` passed to fetch; `stopStreaming()` calls `controller.abort()`; send button swaps to a square stop icon while streaming; Escape key aborts when loading; partial response committed to message list with `*(stopped)*` indicator. Enter blocked while streaming to prevent double-sends.
- **Pre-M7 (identified, not yet fixed): dev app and prod share one DB — must split.** The Doppler
  `dev` config injects the prod Supabase connection into the *running* dev app, so manual local dev
  writes to live data. Decided fix: point `dev` at the local Supabase stack (already used by tests),
  keep `prd` on prod. The *why*: prod data is sacred — you never develop against it, because there's
  no undo on a careless delete. RLS already isolates *users* (different email = different rows, in any
  environment); this is about isolating *environments* so experiments can't hit live rows. Two tiers
  now (local + prod); a cloud "staging" project is the third tier, added when preview deploys exist.
  Tracked as a MAJOR item under "Known debt & gaps → Environments." See that entry for the mechanism.
- Unifying principle: *defer capability until the need is real; structure so adding it is cheap.*

## Current state

- **M1–M6.5 DONE & DEPLOYED. Pre-M7 features: rate limiting + stop button also shipped.**
- **Chat loop:** `src/app/page.tsx` → `src/components/ChatWindow.tsx` → `src/app/api/recipes/route.ts` → `ratelimit.ts` → `db.ts` + `ai.ts` → Claude (streamed back; abortable)
- **Pantry loop:** `src/app/pantry/page.tsx` → `src/app/api/pantry/route.ts` → `src/lib/db.ts` → Supabase
- **Auth:** `src/lib/auth.ts` `getUserId()` → JWT on all user-scoped routes; `middleware.ts` gates all routes except `/login`
- **Rate limiting:** `src/lib/ratelimit.ts` → Upstash Redis; 10 req/60s per user on `/api/recipes`
- **Design:** Mise design system; `design_handoff/STATUS.md` is the living tracker of what's built vs deferred
- **Deployed:** https://meal-prep-tawny-kappa.vercel.app — auto-deploys on push to `main`.
- **Next:** M7 — evaluate receipt scanning (OCR) vs prioritising nav model (pantry sheet, history drawer).

## Known debt & gaps (things real apps have that we don't yet)

### Environments (MAJOR — do before sharing the app or adding destructive features)
- ✅ **FIXED (Step 1): local dev now hits LOCAL Supabase, not prod.** Doppler `dev` config's three
  Supabase vars (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
  re-pointed at the local stack (`127.0.0.1:54321/54322`); `stg`/`prd` untouched (still prod).
  Verified: a row written via the `dev` config lands in local (count 1) and is absent from prod
  (count 0). `supabase/seed.sql` seeds local with a working login (`test@local.dev` / `password123`)
  + sample pantry. **Dev-session ritual now: OrbStack → `supabase start` → `doppler run -- npm run dev`.**
  Skipping `supabase start` gives `ECONNREFUSED 127.0.0.1:54322` (box has the address, but no DB
  exists there until booted — address-in-box ≠ DB-exists).
  *Original bug (now closed):* `doppler run -- npm run dev` injected the *prod* connection into the
  running app, so local clicking wrote to live production data. Discovered when adding an item on
  localhost made it appear in prod (same email → same `user_id` → same rows; the "mirror" was correct
  behavior, not a bug).
  **The risk is safety, not privacy:** RLS + `db.ts`'s `where user_id = $userId` already isolate
  *users* correctly regardless of environment — a different email never sees another person's pantry.
  But there's no sandbox, so a bad delete or a destructive migration tried locally hits prod rows.
  **NOTE the distinction:** our *tests* are already isolated — `TEST_DATABASE_URL` (local Supabase,
  127.0.0.1:54322) is used only by db.ts integration tests, never by the running app. The gap is
  the *manual* dev loop, not the test loop.
  **Fix (decided — local Supabase):** point Doppler's `dev` config's `DATABASE_URL` +
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` at the *local* Supabase stack
  (the one already booted with `supabase start` for tests), leaving `prd` on the prod project. Then
  the running dev app and the tests both hit local; prod is only ever touched by the deployed Vercel
  app. A third "staging" cloud project (for Vercel preview deploys / external QA) is the next tier up,
  deferred until preview deploys or other people are testing. This MUST land before M7's OCR work
  (which will write a lot of new pantry rows) and before any feature that bulk-deletes/mutates data.
  **→ Full mental model + "who fills the box where" map + schema etiquette: `docs/environments.md`.**
- ⬜ **No staging DATABASE (the rehearsal gap).** Vercel Preview deploys exist (auto, per-branch) =
  a staging *app*, but Doppler `dev`/`stg`/`prd` ALL point at the same prod DB (`omwvoxemybeukmhnyrhb`,
  verified). So the 3-config structure is real but the isolation is cosmetic — three doors into one
  room. Consequence: a Preview deploy would read/write PROD data, and the current merge flow
  (branch → CI check → merge to main → straight to prod) has no place to test the *running* app
  before users see it. Fix (deferred, Step 3): create a separate cloud staging Supabase project,
  point `stg` + Vercel Preview at it, adopt the PR-preview-review habit (the PR's own Preview URL is
  the staging gate — no separate `staging` branch needed). Earns its place when preview deploys or
  external QA actually happen. GitHub Environments (Preview/Production) are empty Vercel bookkeeping
  (0 secrets, 0 rules) — NOT part of CI (`ci.yml` references no environment); nothing to fix there.
  **→ Full build plan in `docs/environments.md` ("Staging" section):** staging DB must be its own
  CLOUD instance (local can't serve a cloud deploy; prod defeats the purpose). Three ways — (1) free
  2nd Supabase project + point `stg`/Preview at it; (2) persistent branch; (3) Supabase Branching 2.0
  which auto-creates a per-PR DB and auto-injects creds into Vercel Preview (recommended to evaluate
  first; confirm Hobby-plan availability). Seeds = repo files selected per-env (local small,
  staging richer, prod none). Vercel Preview is a FULL curl-able app; only its secrets/DB differ.
- **CORRECTION to the M5 "RLS enabled" claim:** `items` has `enable row level security` but NO
  policies and NO `force row level security`; `db.ts` connects as the table owner (pooler), which
  BYPASSES RLS. So user isolation in the app's data path is ONE layer — the explicit
  `where user_id = $userId` in every query (present + tested) — not the two layers implied earlier.
  Adding real defense-in-depth = a migration with `force row level security` + a `create policy`
  (test on local first; `force` subjects existing db.ts queries to the policy). Optional for 1 user.

### Security
- ✅ **Rate limiting** — sliding window 10 req/60s per user via Upstash Redis; `src/lib/ratelimit.ts`; returns 429 with friendly frontend message
- ⬜ **Input sanitization** — `name` is validated for existence but not length/content

### Reliability
- ✅ **Error handling (API responses)** — all routes return `Response.json({ error: "..." }, { status })`. Consistent JSON bodies mean the frontend can always call `res.json()` safely.
- ✅ **Error handling (frontend)** — `ChatWindow.tsx` checks `res.status === 401` explicitly and shows "Session expired — please sign in again" before attempting `res.json()`.
- ✅ **Loading states** — pantry shows animated skeleton while fetching (no flash to empty state)
- ✅ **Empty states** — pantry shows dashed circle prompt; chat shows M monogram + Spectral heading
- ✅ **Auth redirect** — middleware gates all routes except `/login`; appends `?returnTo=` so users land where they were headed after login
- ✅ **Tests** — 23 unit tests + 7 integration tests across routes, db, auth, middleware
- ⬜ **Login UX gives no actionable feedback on failed/slow sign-in.** `src/app/login/page.tsx`
  handler is logically correct, but: errors render in ember (easy to miss), there's no distinct
  message for a rate-limited attempt (Supabase `sign_in_sign_ups = 30/5min/IP`), and a hung request
  leaves `loading` stuck true with no timeout. Surfaced when a `user@gmail.com` account that had been
  Supabase-rate-limited (from repeated `422` signup attempts on the prod-wired Preview) appeared to
  "do nothing" on a single click. Not a bug — transient rate-limit — but the silence is the real gap.
  Fix later: prominent error display + explicit 429/rate-limit message + a request timeout fallback.

### Observability
- ⬜ **Error monitoring** — no Sentry or equivalent; silent failures in prod go unnoticed
- ⬜ **Logging** — no structured server logs beyond what Vercel captures

### Developer experience
- ✅ **Shared `auth.ts`** — `getUserId()` extracted to `src/lib/auth.ts`; all API routes import from it
- ✅ **UI consistency** — all pages on Tailwind, warm Mise tokens; no more inline `style={{}}`

### Future skills to learn (different domain, not urgent)
- **Docker** — containerize the app so it runs the same everywhere; relevant when moving off Vercel
- **Kubernetes** — orchestrate containers at scale; needed only with real traffic
- **OpenTelemetry** — structured observability for prod; earns its place once the app has real users

## Commands

- `doppler run -- npm run dev` — start local dev server (secrets injected by Doppler)
- `doppler run -- npm run build` — production build with Doppler secrets
- `npm run lint` — lint (no secrets needed)
- `npm test` — run all tests in watch mode (requires local Supabase running for db.ts tests)
- `npm run test:unit` — run unit/mock tests only (no Supabase needed)
- `npm run test:integration` — run db integration tests only (requires Supabase running)
- `npm test -- --run` — run all tests once and exit

### Secrets management (Doppler)
- All secrets live in Doppler (dashboard.doppler.com → meal-prep project)
- `dev` config → local machine via CLI; `prd` config → Vercel via sync integration
- Adding a new secret: add it in Doppler once → flows to local + Vercel automatically
- `.env.local` contains ONLY `TEST_DATABASE_URL` (local Supabase for integration tests)
- `.env.example` documents what secrets exist and that Doppler is the source of truth

### Before running db.ts tests (once per dev session)
1. Open OrbStack
2. `supabase start` — boots local Postgres at postgresql://postgres:postgres@127.0.0.1:54322/postgres

### When schema changes (remote DB changed)
- `supabase db pull` — pulls new schema into supabase/migrations/
- `supabase db push` — pushes local migration files to remote DB
