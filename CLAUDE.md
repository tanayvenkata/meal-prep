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
- [x] **M3 — Pantry CRUD.** DONE locally (NOT yet deployed). Add/edit/delete ingredients,
      persisted in Supabase Postgres. Full loop: /pantry page → fetch → /api/pantry route
      → db.ts boundary → postgres driver → Supabase. Survives refresh. *Postgres earned its
      place* (we felt state vanish on refresh first, then added the DB). ⚠️ Live deploy
      pending: Vercel still needs `DATABASE_URL` added to its env store before pushing.
- [ ] **M4 — Recipe suggestions.** Send pantry + mood + time to the AI; get ideas back.
      *This is where M1's AI (ai.ts) meets M3's pantry (db.ts) — the two halves join.* ← **NEXT**
- [ ] **M5 — Auth + saving recipes.** Real multi-user-capable app (Supabase auth).
- [ ] **M6 — Voice mode.** Web Speech API (free, in-browser) first.
- [ ] **M7 — Receipt scanning (OCR).** Evaluate if it's worth it by now.

## Architecture (current — the lightweight system design)

```
   BROWSER (frontend)          SERVER (backend)              ANTHROPIC
   src/app/page.tsx            src/app/api/chat/route.ts     Claude
   - text box                  - holds the SECRET api key    - the model
   - message list              - calls the AI via ai.ts
        |  POST /api/chat            |  stream                    |
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
- **M3 known debt (deliberate, not drift):** pantry page uses inline `style={{}}` while the chat
  page uses Tailwind `className`. Cosmetic only, crosses no boundary — left for a later styling
  pass rather than churned mid-milestone. Also: front-end mutate() helper has no `res.ok` check
  yet (backend 400s are silently swallowed) — the natural next error-handling lesson.
- Unifying principle: *defer capability until the need is real; structure so adding it is cheap.*

## Current state

- **M1 + M2 DONE.** `@anthropic-ai/sdk` installed. Model: `claude-sonnet-4-6` (cheap for
  now; revisit at M4).
- **Full streaming loop works, local AND live:** `src/lib/ai.ts` (the SDK boundary —
  `streamChat(messages)`, async generator) → `src/app/api/chat/route.ts` (POST handler,
  wraps the generator in a `ReadableStream`) → `src/app/page.tsx` (chat UI). Verified via
  the browser and `curl -sN` against both `localhost:3000` and the live Vercel URL.
- **Deployed:** https://meal-prep-tawny-kappa.vercel.app — auto-deploys on push to `main`
  (Vercel watches GitHub). `ANTHROPIC_API_KEY` set in Vercel's env-var store for prod.
- Env files: `.env.example` (template, committed) + `.env.local` (real key, git-ignored).
- **Next:** M3 — Pantry CRUD. This is where Postgres (Supabase) earns its place. Build the
  UI to add/edit/delete ingredients, feel state not persisting on refresh, THEN add the DB.

## Commands

- `npm run dev` — start local dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run lint` — lint
