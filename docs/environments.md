# Environments & Config — the mental model

> Written during the "reset and learn" session. This is the **game plan** for how
> environments, secrets, and databases relate. Read this before touching Doppler,
> Supabase, or Vercel config. The *why* is the point.

## The one rule everything serves

**Production data is sacred. You never develop or test against it — there's no undo.**
Everything below is just *how* we arrange databases and config to honor that rule.

## Two orthogonal tools (don't conflate them)

- **Environments / config (Doppler)** answer: *which settings + which database does this run use?*
- **Containers (Docker / OrbStack)** answer: *is the machine this runs on identical everywhere?*
  (Deferred — named, understood, not built. Earns its place if/when we move off Vercel.)

This doc is about the first one.

## What an "environment" is and why three exist

One codebase, but it runs in different *situations*. Each situation gets its own config and
its own data. The point is a **gradient of safety** — code flows left → right, and each step
is a cheap checkpoint to catch problems before they reach real users.

| Environment | Situation | Whose data | Cost of breaking it |
|---|---|---|---|
| **Development** | actively writing code; breaking things is fine | fake/junk | nothing — it's a sandbox |
| **Staging** | code looks done; rehearse prod before users see it | realistic fake | caught internally |
| **Production** | real users, real data, real consequences | real, irreplaceable | money, trust, data loss |

**Data flows DOWN, never UP.** You may copy a slice of prod → dev to debug (carefully). You
NEVER let dev write → prod. Sharing one DB across environments violates this — that was the bug
that kicked off this whole session (localhost writes appeared in prod).

## The map (our actual setup)

```
                 SHARED                         DIFFERS PER ENVIRONMENT
                 ──────                         ───────────────────────
  app source code                        Supabase project (DB + AUTH + STORAGE — one unit)
  ANTHROPIC_API_KEY (today: one key;     Upstash Redis instance
    best prac: separate dev/prod keys
    so a leaked dev key can't hit prod)

  ┌─ LOCAL DEV ──────────┐   ┌─ STAGING (later) ───┐   ┌─ PRODUCTION ──────────┐
  │ where: your laptop   │   │ where: cloud        │   │ where: Vercel          │
  │ Supabase: LOCAL      │   │ Supabase: stg cloud │   │ Supabase: prod cloud   │
  │   (OrbStack 127.x)   │   │ (no real users)     │   │ (real users)           │
  │ Doppler: dev config  │   │ Doppler: stg config │   │ Doppler: prd → Vercel  │
  └──────────────────────┘   └─────────────────────┘   └────────────────────────┘
       ▲ build here              ▲ rehearse                ▲ serve
       └────────── code flows left → right; data NEVER flows right → left ──────────┘
```

## Key facts (learned the hard way this session)

1. **A Supabase project is DB + Auth + Storage as ONE unit.** Auth isn't separate from the DB —
   each Supabase project has its own users + its own JWT signing secret. So to make local dev
   fully local, all THREE vars must move together, or you get a "split brain" (server on local
   DB, browser logging in against prod):
   - `DATABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

2. **Doppler injects into `process.env` and WINS over `.env.local`.** Next.js does NOT override a
   var already set in `process.env` (verified against Next.js source). So local overrides belong
   IN Doppler, not in `.env.local`. `.env.local` only matters for keys Doppler doesn't set
   (here: `TEST_DATABASE_URL`).

3. **How Doppler knows which config is "yours":** `doppler setup` writes your project+config
   choice to a local file keyed to that directory. `doppler run` then uses it. The choice lives
   per-laptop, not in git — that's how teammates use the same repo with different configs.

4. **Branch configs** (e.g. `dev_personal`) inherit from a root config and override only the few
   keys you change ("respects local overrides"). They exist for TEAMS — each dev overrides their
   own machine-specific values while inheriting shared ones. **We do NOT use one yet:** local
   Supabase uses identical default ports/keys on every machine, so there's nothing machine-specific
   to isolate. A branch here would just add a footgun (root still pointing at prod). The branch
   earns its place when a SECOND developer appears.

## Local DB: two activities, one local Supabase instance

- **Automated tests** (`npm run test:integration`): spin up → seed known rows → assert → wipe.
  Ephemeral on purpose — tests must be deterministic. (`TEST_DATABASE_URL`, untouched by this work.)
- **Manual dev** (`npm run dev`): wants data to PERSIST between sessions. Uses a `seed.sql` so a
  fresh local DB comes up usable, and leaves its rows alone.
- Both hit the same local Postgres (`127.0.0.1:54322`); tests clean up after themselves so they
  don't pollute manual-dev data.

## Decided plan (smallest correct step first)

- **Step 0** — this doc. ✅
- **Step 1** — point Doppler `dev` ROOT config → local Supabase (all 3 vars). No branch.
  Prereqs folded in: confirm local `items` table exists; create `supabase/seed.sql`; verify prod
  is untouched after a local write.
- **Step 2** (later) — separate dev/prod Anthropic key. Teaches "secrets differ per env."
- **Step 3** (deferred, named not built) — staging, GitHub Environments, Docker. Add when the need
  is real (a second dev, preview deploys, moving off Vercel).

## Separate track (NOT env work) — RLS is one layer, not two

Found this session: `items` has `enable row level security` but **no policies** and **no
`force row level security`**. `db.ts` connects as the table owner via the pooler, which BYPASSES
RLS. So in the app's real data path, the ONLY thing isolating users is the explicit
`where user_id = $userId` clause in every query (present + tested). The mental model "the DB will
save me if I forget the WHERE" is FALSE here. Defense-in-depth (FORCE RLS + a policy) is a good
security lesson but optional for a single-user app. Tracked separately from the environment work.

## Naming note

Doppler's environment is **Development** / config **dev**; **Staging** / **stg**; **Production** /
**prd**. We use the config slug (`dev`/`stg`/`prd`) in commands: `doppler run -c dev -- ...`.

---

# The "who fills the box, where" map (the cleanse)

The line `postgres(process.env.DATABASE_URL!)` never changes. `DATABASE_URL` is just a labeled
box. The whole question is always: **in THIS place, who put the value in the box, and what is it?**
"Who fills it" and "what value is in it" are SEPARATE questions — trace them separately.

| Place | Script run | Who fills the box | Mechanism | DB it hits |
|---|---|---|---|---|
| **Tests** (laptop or CI) | `vitest` | `vitest.config.ts` `env:` | clobbers — wins over the shell | local `127.0.0.1:54322` |
| **Local dev** | `dev` = `doppler run -- next dev` | Doppler `dev` config | **injects** live, every run | prod ⚠️ *(the bug — value still points at prod until Step 1)* |
| **CI build step** | `build` = `next build` | `ci.yml` `env:` block | plain shell env | local-on-the-runner |
| **Vercel** | `build` then `start` | Vercel's own env store | **synced** from Doppler `prd` ahead of time | prod cloud |

Two mechanisms, don't confuse them:
- **inject** (local dev): `doppler run` pulls the config and hands it to the child process LIVE, every run, via the CLI wrapper. Doppler is present at runtime.
- **sync** (Vercel): Doppler `prd` COPIES values into Vercel's own env store ahead of time. Doppler is NOT live at Vercel runtime — Vercel reads its own store. `.env.local` is gitignored, never deployed, so nothing to clobber there.

## "Who wins" is decided by the CONSUMER, not by a global rule

There is no universal "first wins" or "last wins" for env vars. `process.env` is a shared dict;
each PROGRAM that reads it has its own policy for what to do when a value is already set:

- **Next.js — won't clobber.** If a var is already in `process.env`, it does NOT override it from
  `.env.local`. So Doppler (injected first) BEATS `.env.local`. Intent: a real injected/deployed
  value should beat a local convenience file.
- **Vitest — clobbers.** It spreads its `test.env` ON TOP of the inherited environment, inside the
  test worker. So `vitest.config.ts` BEATS the CI shell's `env:`. Intent: tests must control their
  own world to stay deterministic, ignoring whatever messy env they launched in.

Same situation, opposite behavior — because the two tools made opposite design choices. When asking
"which value does the code see?", don't reason about env vars in the abstract — ask *which program
reads this box, and does it clobber?*

## Two tracks of time (they meet only at the DATABASE_URL box)

```
TRACK 1 — the database (run occasionally, the `supabase` CLI)
   open OrbStack → supabase start ........... boots ~10 Docker containers (Postgres+API+Auth+...)
   supabase db reset ........................ rebuild tables (migrations) + re-run seed.sql
   (start/stop/status = LOCAL-ONLY by nature; db push/pull = the only cloud-touching commands)

TRACK 2 — the app (run every time you work)
   doppler run -- npm run dev ............... inject secrets → start app → connect to whatever
                                              DB the DATABASE_URL box points at
```
Track 1 makes a DB *exist* at an address. Track 2's app *connects to* that address. `supabase start`
fills NO box — it only makes the DB exist. `vitest.config.ts` / Doppler fill the box with an address.
They must match, but they're separate actors.

## next start: engine vs your code

Three layers: **Node** (the JS runtime, executes any JS) → **`next`** (the engine — a downloaded
dependency in `node_modules/`, written by Vercel, not you) → **`src/`** (your app — the pages/routes
the engine runs). `package.json` declares WHICH engines (`dependencies`) and HOW to start them
(`scripts`); your app code is not in `package.json` at all — it's in `src/`. `dependencies` ship to
prod; `devDependencies` (vitest, eslint, husky) are build/test-only and don't.

---

# Schema change etiquette (dev-first; promote rightward; pull is recovery-only)

Schema/migrations flow LEFT → RIGHT (dev → staging → prod), same as code. Data is net-new on prod
from users and NEVER flows backward.

**The correct loop for ANY schema/security change (tables, RLS, policies, functions):**
```
1. supabase migration new <name>     → empty timestamped .sql file in the repo
2. write the SQL in it                → YOU author the change, in code
3. supabase db reset                  → apply to LOCAL, test the app against the new shape
4. commit the migration file          → repo is the source of truth
5. supabase db push                   → promote the SAME file to prod (prod gets it LAST)
```
Prod is the last place a schema change lands, never the first. `db pull` does NOT appear here.

**Rules:**
- **Never change schema/structure via the Supabase GUI.** That's the prod-first anti-pattern: the
  change exists only in the cloud, the repo never learns about it → drift → forces a recovery `pull`.
- **`db push` is the dangerous one.** It runs migrations against prod's LIVE data, no undo. `db pull`
  is safe (read-only, cloud→files).
- **`db pull` is recovery-only** — for when prod was changed out-of-band (GUI/direct SQL) and the repo
  is now behind. Not part of the normal loop. The two `*_remote_schema.sql` migrations in this repo
  ARE pulled files — the receipt of an early prod-first bootstrap. Leave them: verbose-but-faithful
  (they capture the TRUE prod state, incl. implicit grants/indexes) beats clean-but-lying.
- **Never edit an already-applied migration.** Migrations are an append-only ledger of what happened.
  To change schema, write a NEW migration. Editing old ones causes "won't replay on a fresh DB" bugs.

**The GUI is legitimately for:** viewing data/tables, grabbing API keys / connection strings,
account/auth/billing/project setup. I.e. *structure = code; setup & looking = GUI.*

## RLS note (ties to the "one layer" finding above)

When we add RLS for real, the migration needs BOTH lines, because `db.ts` connects as the table
owner (which bypasses RLS by default):
```sql
alter table items force row level security;          -- make RLS apply even to the owner
create policy "users see own items" on items
  for all using (auth.uid() = user_id);
```
Without `force`, the policy appears to "do nothing" on the app's path — a confusing non-result.
Test on LOCAL first (`force` will suddenly subject existing db.ts queries to the policy — verify they
still pass before `db push`). This is exactly why dev-first exists.

---

# Staging — how to build it when the need is real (Step 3, deferred)

Researched 2026-06-25 (via Supabase docs). Captured for when preview deploys / external QA actually happen.

## Why staging's DB must be its OWN cloud DB (not local, not prod)
- **Not local (`127.0.0.1`):** Vercel Preview runs on Vercel's SERVERS, not your laptop. `127.0.0.1`
  there = Vercel's own machine, where no Supabase exists. A cloud-deployed app physically cannot reach
  your local stack. **Rule: runs-on-your-laptop → local DB; runs-in-the-cloud → a cloud DB.**
- **Not prod:** then the "rehearsal" writes to live data — defeats the purpose.
- So staging needs a SEPARATE CLOUD Supabase instance: a cloud DB that isn't prod.

## Three ways to get that staging DB (simplest → most automatic)
1. **A second Supabase project** — Supabase gives 2 free DBs. Create one, point Doppler `stg` + Vercel
   Preview at it. You manage its migrations/seed by hand. Dead simple, free.
2. **A persistent branch** — mark a long-lived git branch (e.g. `develop`) as staging with its own DB.
3. **Branching 2.0 / Preview Branches (recommended to evaluate first)** — Supabase auto-creates a
   fresh, isolated DB *per PR* (a copy of the schema, NO data), and its Vercel integration
   AUTO-INJECTS that branch's unique credentials into the matching Vercel Preview deploy. This is the
   "no manual stg config, no split-brain" path — purpose-built for exactly our gap. Caveat: more
   involved setup and historically some branching features are paid-plan-gated — CONFIRM on the Hobby
   plan before relying on it; fall back to option 1 (free second project) if gated.

## Seeding across environments (the model)
- **Seed scripts are FILES IN THE REPO** (`supabase/seed.sql`, could add `supabase/seeds/staging.sql`),
  version-controlled. Each ENVIRONMENT's config picks which file(s) to run:
  ```toml
  [db.seed]                    sql_paths = ["./seed.sql"]            # local: small, click-around data
  [remotes.staging.db.seed]    sql_paths = ["./seeds/staging.sql"]  # staging: bigger/realer for depth
  ```
- **Seeds run at DB creation/reset, NOT per deploy.** A branching preview DB seeds once at branch
  creation, persists for the PR's life, destroyed when the PR closes (ephemeral per-PR, persistent
  within it — right for review).
- **Local** → small seed (persistent click-around). **CI** → no seed needed (tests make+wipe their own
  rows; it *could* seed, but doesn't need to). **Staging** → same file as local, or a richer dedicated
  one. **Prod** → NO seed, only real user data.

## Vercel Preview is a FULL app, not "light UI testing"
Same `next build`/`next start`, same API routes, same capabilities as prod — curl-able, streamable,
full auth/CRUD/rate-limit. The ONLY difference between Preview and Production is the **env/secrets**
(chiefly its own Supabase instance = its own DB+auth+storage), NOT the code. So "the difference is the
data" is the headline, but precisely: *same code, different secrets; the DB+auth travel together as one
Supabase instance.* (Caveat: Vercel deployment-protection may put a login wall in front of Preview URLs
— may need a bypass token to raw-curl. The app is fully capable; that's just Vercel's gate.)

## The merge flow staging unlocks (the rehearsal step we lack today)
Today: branch → CI check → merge to main → straight to prod (no rehearsal of the running app).
With staging: branch → PR → CI check + Preview deploy (its own DB) → review/test the RUNNING app on the
Preview URL → merge to main only after it looks good. The PR's Preview URL IS the staging gate — no
separate long-lived `staging` branch required.
