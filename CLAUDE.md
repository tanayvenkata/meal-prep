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
- [ ] **M2 — Deploy to Vercel.** Get the public deploy pipeline working early. ← **NEXT**
- [ ] **M3 — Pantry CRUD.** Add/edit/delete ingredients. *This is when Postgres earns
      its place* (we'll feel the pain of state not persisting first).
- [ ] **M4 — Recipe suggestions.** Send pantry + mood + time to the AI; get ideas back.
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
- Unifying principle: *defer capability until the need is real; structure so adding it is cheap.*

## Current state

- M1 in progress. `@anthropic-ai/sdk` installed. Model: `claude-sonnet-4-6` (cheap for
  M1; revisit at M4).
- **Piece 1 DONE:** `src/lib/ai.ts` — the boundary. `streamChat(messages)`, an async
  generator yielding text chunks. Only file that imports the SDK.
- **Piece 2 DONE + VERIFIED:** `src/app/api/chat/route.ts` — POST handler. Reads
  `messages` from the request body, calls `streamChat`, wraps the generator in a
  `ReadableStream`, returns `new Response(stream)`. Hand-written by the user.
  Confirmed working via `curl -N -X POST localhost:3000/api/chat` — Claude's reply
  streamed back. New API key confirmed valid (no 401).
- Env files: `.env.example` (template, committed) + `.env.local` (real key, git-ignored).
- **Next:** Piece 3 — chat UI in `src/app/page.tsx`: text box + send button that POSTs
  to `/api/chat` and renders the streamed reply. The "button" that replaces curl.

## Commands

- `npm run dev` — start local dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run lint` — lint
