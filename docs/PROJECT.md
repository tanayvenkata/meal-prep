# Mise — current project brief

Last reviewed: **2026-09-07**. Current implementation facts and accepted objectives
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
The local evaluation slice is implemented; its runnable
instructions and limitations live in [the evaluation README](../evals/kitchen/README.md).
Read the relevant sections when making a foundation decision; do not load all
historical documents for routine changes.
Current verified requirements and remaining gates are indexed in
[foundation acceptance](FOUNDATION-ACCEPTANCE.md).

The local evaluation loop is implemented and the user selected four composable
tools. See [the decision](audits/2026-09-06/four-tool-decision.md) and
[rollout evidence](audits/2026-09-06/four-tool-rollout-final.json). The final combined
Luna regression accepted 26/26 cases (25 task successes and one expected safe
failure). These are measured cases, not a universal reliability claim.
OpenTelemetry correlates command/tool/HTTP outcomes. Production ingestion on
Vercel and the separate Worker is verified in [OBSERVABILITY.md](OBSERVABILITY.md).
The four-tool rollout merged in PR #208; older audit stages are historical evidence.

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
PR #208 implements the four-tool default on MCP SDK v2. The old 12-tool reference
requires explicit MISE_TOOL_SURFACE=baseline. A confirmed purchase can combine new
items and restocks within one atomic add batch; no fifth receipt tool is needed.
Spices are pantry items, with optional turnover metadata. Structured quantities
support server-side arithmetic; unspecified quantities stay unknown.

## Pantry availability decision — 2026-09-06

The user prefers that explicit “finished” or “ran out” pantry updates remove the
item, keeping the active pantry simple. Do not create a shopping-list/history
system or retain zero-quantity entries solely for future restocking. A partial
consumption statement does not imply removal. This is an accepted product direction;
tool behavior and host acceptance must still be verified against it.

## Current implementation, not a permanent target

```text
ChatGPT → authenticated /mcp (Next.js on Vercel, verified installed app) → kitchen service → Postgres
Website → authenticated Next.js APIs → same service → same data
```

- TypeScript, Next.js 16.3.4, Node **24**, React, Zod, and the MCP TypeScript SDK v2.
- Supabase provides Postgres and authentication, including the MCP OAuth server.
  `src/lib/db.ts` owns SQL (with lazy client instantiation for edge workers, connecting via Supavisor transaction pooler); `src/lib/kitchen-service.ts` owns kitchen behavior.
- MCP defaults to four tools: `read_kitchen`, `add_items`, `edit_items`, `remove_items`.
  All three write tools accept lists and expose structured outcomes. Food/spices
  default to pantry; equipment uses the same actions with an explicit collection.
  Preserve user-supplied names, optional quantities, and explicit removal intent.
  No unit conversion is implemented.
- The MCP surface is tool-only. The old kitchen widget and native website chat/history
  UI were removed. The website supports login, consent, and inventory correction.
- The installed production MCP app uses `https://meal-prep-tawny-kappa.vercel.app/mcp`, verified in ChatGPT settings on 2026-09-07. Vercel hosts both this handler and the web control plane.
- Hono (`src/mcp/worker.ts`) is separately deployed at `https://mise-mcp.tanayvenkata.workers.dev/mcp`. It is not the verified installed app endpoint. Standalone Express (`mcp:dev`) and Miniflare (`mcp:worker`) remain local test loops.
- Vercel auto-deploys `main`; GitHub CI applies database migrations after checks. The Worker deploys separately via `pnpm run deploy:worker`. Neither a merge nor a Worker deployment changes the installed connector URL. See [deployment verification](MCP-DEPLOYMENT.md) for evidence, endpoint checks, and cutover requirements.

## Operational facts to preserve through redesign

- **Identity is trusted server-side.** MCP verifies bearer tokens before exposing
  account data. Website APIs preserve OAuth client identity. Direct OAuth/Data API
  access is read-only for owned kitchen data; narrow MCP writes use server commands.
  See `src/mcp/AGENTS.md` before changing this boundary.
- **Ownership has two layers.** SQL predicates scope data to users; `mise_app` is a
  non-owner role without RLS bypass. `withUserContext` sets trusted user identity and
  enters the authenticated role transactionally. Do not replace this with an owner
  connection to make tests or a migration easier.
- **Keep local and preview isolated from production.** Local development uses Supabase at
  `127.0.0.1`; production secrets come through Doppler/Vercel. Preview is currently
  credential-free and proves the build, not authenticated runtime behavior. Verify
  actual configuration using [the environment runbook](environments.md).
- **Retry guarantees are per request.** Four-tool writes use durable operation
  receipts plus fresh expectations. The legacy baseline relative tools retain
  older expected-quantity-only limitations; do not confuse their guarantees.
- **Legacy chat data remains.** `conversations` and `messages` contained user data at
  the last production audit. Application chat helpers are removed; database isolation tests still protect
  the retained tables. Do not drop those tables without an export/retention decision.
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


## Current capability and prompt map

See [the source audit](audits/2026-09-07/capability-audit.md) for the dated issue
assessment and runtime entry points. ChatGPT supplies conversation, vision, and
recipe generation; Mise does not run a production model loop. Five MCP prompt
templates are registered in `src/mcp/server.ts`; they are not automatically
applied system instructions or proof of visible ChatGPT starters. Server
instructions and tool descriptors are separate runtime guidance. Repository
Markdown and historical persona designs are not loaded into the host.

The read-only card PR #246 was closed without merging after its spike was
shelved. It is not an active implementation or a shipped widget. Dish logging
and Cooking Wrapped remain unimplemented candidates (#13 and #31).
