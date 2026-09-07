# Mise — current project brief

Last reviewed: **2026-09-06**. Current implementation facts and accepted objectives
live here. The backlog lives in GitHub Issues and the Mise Board; workflow is in
`CONTRIBUTING.md`, setup and commands in `README.md`.

## Objective and working style

Build a useful personal kitchen memory and cooking/meal-prep assistant. The user
mainly asks ChatGPT to use saved food, spices, and equipment; additions and edits
have felt unreliable. Establish an empirical foundation before expanding features:
observable outcomes, repeatable evaluations, reliable effects, and recovery.

This is a learning project. Explain why before implementing, work in understandable
vertical slices, and record the evidence behind decisions. Optimize for useful
behavior, cost, and transferable learning. Existing vendors, language, tool counts,
quantity rules, and interface choices are open to revision. The older roadmap is
not a commitment to rebuild its features.

## Foundation review

The [2026-09-06 audit](FOUNDATION-AUDIT-2026-09-06.md) contains findings, source
references, cost comparisons, an observability/evaluation proposal, and candidate
work packages. **Its recommendations are proposals, not adopted implementations.**
The local evaluation slice is now being implemented in issue #191; its runnable
instructions and limitations live in [the evaluation README](../evals/kitchen/README.md).
Read the relevant sections when making a foundation decision; do not load all
historical documents for routine changes.
Current verified requirements and remaining gates are indexed in
[foundation acceptance](FOUNDATION-ACCEPTANCE.md).

Verified baseline: `c4debb6`. Unit and local integration lanes pass. The simple
Mayo addition works through the real MCP handler and local database with injected
auth. However, HTTP 200 can carry input errors, rejected changes, or backend tool
errors. The draft observability slice now distinguishes tool and command outcomes
and correlates them with OTel traces; see [observability](OBSERVABILITY.md).
A past post-commit timestamp
serialization failure was fixed in #188. The cause of the user's particular past
failure is unproven. The first automated inventory-effect baseline and its
before/after schema experiment are recorded in
[the evaluation report](audits/2026-09-06/kitchen-evaluation.md); broader host and
answer-quality acceptance remain pending.

Before scheduling more features, prioritize observable writes and reproducible
agent behavior. Keep a small real MCP-to-database test set alongside isolated unit
tests. Evaluate tool-surface alternatives on the same task cases before choosing.

## Evaluation spending — 2026-09-06

The user removed the earlier $5 cumulative cap and ledger requirement. Run normal
Luna evaluations with automatic per-run usage/cost reporting and bounded request
loops. Earlier issue text, audit evidence, and ledger totals describe historical
experiments, not an ongoing spending gate. Do not manage or update that ledger.

## Tool direction — 2026-09-06

The user selected four composable inventory tools: read, add, edit, and remove.
Food, spices, equipment, quantity changes, and batches belong within that surface.
Use optional fields for information that is not necessary to execute a request;
keep identifiers and concurrency checks explicit where correctness requires them.
The selectable candidate is in PR #208; this decision does not claim deployment
or production rollout. A fresh four-turn ChatGPT check passed on the isolated
synthetic account; see the [decision record](audits/2026-09-06/four-tool-decision.md). The 12-tool interface remains an evaluation
reference until the replacement is validated. See the tool-surface comparison for
raw evidence and limitations. No fifth receipt-specific tool is planned: a confirmed
purchase can combine creation and restocking inside an atomic add batch.

## Pantry availability decision — 2026-09-06

The user prefers that explicit “finished” or “ran out” pantry updates remove the
item, keeping the active pantry simple. Do not create a shopping-list/history
system or retain zero-quantity entries solely for future restocking. A partial
consumption statement does not imply removal. This is an accepted product direction;
tool behavior and host acceptance must still be verified against it.

## Current implementation, not a permanent target

```text
ChatGPT → authenticated /mcp → kitchen service → Postgres
Website → authenticated APIs → same service → same data
```

- TypeScript, Next.js 16.3.4, Node **24**, React, Zod, and the MCP TypeScript SDK.
- Supabase provides Postgres and authentication, including the MCP OAuth server.
  `src/lib/db.ts` owns SQL; `src/lib/kitchen-service.ts` owns kitchen behavior.
- MCP exposes 12 tools: kitchen read; pantry and equipment lifecycle changes;
  exact quantity set, consume/restock, batch adjustments, and reviewed receipt import.
  Context includes stable IDs. The local candidate now lets add/update preserve
  unknown/text/structured quantities; relative arithmetic remains structured.
  This contract change still needs actual ChatGPT host acceptance. No unit conversion
  is implemented.
- The MCP surface is tool-only. The old kitchen widget and native website chat/history
  UI were removed. The website supports login, consent, and inventory correction.
- Production uses the Next `/mcp` route on Vercel. Standalone Express plus ngrok is
  the existing local host-test loop. Both are stateless per request.
- Deployment: https://meal-prep-tawny-kappa.vercel.app. Vercel auto-deploys `main`;
  GitHub CI also applies database migrations after its checks.

## Operational facts to preserve through redesign

- **Identity is trusted server-side.** MCP verifies bearer tokens before exposing
  account data. Website APIs preserve OAuth client identity. Direct OAuth/Data API
  access is read-only for owned kitchen data; narrow MCP writes use server commands.
  See `src/mcp/AGENTS.md` before changing this boundary.
- **Ownership has two layers.** SQL predicates scope data to users; `mise_app` is a
  non-owner role without RLS bypass. `withUserContext` sets trusted user identity and
  enters the authenticated role transactionally. Do not replace this with an owner
  connection to make tests or a migration easier.
- **Local and preview cannot write production.** Local development uses Supabase at
  `127.0.0.1`; production secrets come through Doppler/Vercel. Preview is currently
  credential-free and proves the build, not authenticated runtime behavior. Verify
  actual configuration rather than following obsolete provider references in the
  historical `docs/environments.md` narrative.
- **Retry guarantees differ.** Receipt imports have durable operation receipts;
  relative adjustments use expected quantities, which do not protect all delayed
  retries after state changes away and back. Preserve or improve guarantees deliberately.
- **Legacy chat data remains.** `conversations` and `messages` contained user data at
  the last production audit. Their retained helpers/tests are compatibility code.
  Do not build new features on them or drop them without an export/retention decision.
- **Test locally.** OrbStack → `supabase start` → `npm run dev`. `test:unit` needs no
  database; `test:integration` uses the local stack. Use `.nvmrc`'s Node 24, including
  when reproducing the audit's diagnostics, which originally ran on Node 26.8.1.
- **Verify changes at the relevant seam.** For tool changes, test wire behavior and
  real data serialization as well as service logic. Actual ChatGPT host acceptance
  remains distinct from an API evaluation runner. Reconnect/refresh changed metadata.

## Documentation authority

The [previous project brief](archive/PROJECT-before-foundation-review-2026-09-06.md)
preserves the old milestone history and rationale. `design_handoff/DESIGN.md` and
`STATUS.md` are historical design references. Consult them for relevant visual work;
do not inherit their screen inventory or backend sequence as requirements.

Keep accepted decisions short, dated, evidence-backed, and revisitable. New audit
proposals become project decisions when selected for implementation, not simply
because an agent wrote them down.

