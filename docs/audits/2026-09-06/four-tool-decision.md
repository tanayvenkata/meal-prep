> Historical decision record. Subsequent implementation and rollout status are in
> [PROJECT.md](../../PROJECT.md), PR #208, and issue #203; the remaining-work list
> below describes the decision boundary at the time.

# Decision: four composable kitchen tools

Selected by the user on 2026-09-06 after the local comparison. The goal is a useful,
measurable kitchen memory; the stopping point is determining the interface and why.
This document is the decision record, not an assertion that the PR is deployed.

## What to build

Keep `read_kitchen`, `add_items`, `edit_items`, and `remove_items`. Food, spices,
and equipment share actions. Food/spices default to pantry; amount and turnover
are optional. Equipment uses an explicit collection and kind. Do not require a
user to invent quantity or classify turnover just to save an item. Retain typed,
documented fields rather than an arbitrary JSON bag whose behavior is unclear.

- Read returns owned inventory with stable references for follow-up actions.
- Add accepts a list of new items and measured increases to existing stock. This
  supports an authorized, resolved receipt within one atomic request.
- Edit distinguishes a stated replacement total from a relative increase/decrease;
  it also handles renaming and turnover. Arithmetic executes on the server.
- Remove accepts a list; explicit finished/ran-out statements remove pantry items.
  Partial consumption and hypothetical plans do not authorize removal.

A mixed edit/remove request can use two tools. No bespoke tool is needed for every
combination. Atomicity is per call, not across multiple model calls: if the second
call fails, the assistant must report the partial result. Each write uses durable
request identity; the same request replays instead of silently performing a second
purchase. Current-state checks still matter for fresh requests and concurrent edits.

## Why four

The old 12 separate resource CRUD, quantity operations, batch adjustments, and
receipt import. Their overlapping selection responsibilities exceed the needs of
this personal inventory workflow. Four preserves the user-facing action boundaries
while putting batch/retry mechanics inside the service. A fifth receipt tool is
unnecessary once add accepts both new items and restocks. A single pantry shell or
catch-all mutation tool would hide these useful read/add/edit/remove distinctions;
there is no measured need for arbitrary execution. Three tools would combine edit
and removal without demonstrated benefit. These are design judgments, not claims
that every count was experimentally tested.

[Anthropic's guidance](https://www.anthropic.com/engineering/writing-tools-for-agents)
favors a few distinct, useful tools and meaningful, efficient responses, evaluated
on tasks with multiple valid strategies. [OpenAI's tool guidance](https://developers.openai.com/plugins/plan/tools)
favors coherent actions, explicit contracts, and separation of reads and writes.
Neither prescribes four universally. We select four for this workflow and the
user's maintainability preference, not because tool count alone predicts quality.

## What the evidence says

- Original same-source Luna pair: baseline 23/23 combined passes; four 21/23.
  One flag required `0.5 jar` rather than faithful `half a jar` text; another judged
  omelette servings despite an inventory-grounding rubric. Raw flags are retained.
- Fresh composition pair: both passed five cases after an equal request-limit
  correction. Initial capped failures are retained. Four cost slightly less for
  the actor but was slower and used more calls in that pair. No universal speed or
  accuracy advantage has been established.
- Latest `93c0597` model recheck: all five composition cases and the lost-add-response
  case passed. The grocery case used read, add, remove; the lost-result case used
  add then read. Equipment checkpoints verify intermediate effects. These are
  regression checks after tuning, not fresh holdouts.
- Focused contract/real-Postgres/HTTP checks: 19 passed, including mixed receipt
  rollback and replay, omitted pantry defaults, ownership boundaries, exact four
  tool discovery, and persisted unknown quantities. Build, TypeScript, lint, and
  252 unit tests passed before push.
- Inspector 2.5.0 CLI discovered exactly the four tools on the isolated local server.
- Actual ChatGPT: a fresh four-turn conversation passed unqualified mayo addition,
  mixed food/equipment addition, restocking plus a new spice, then quantity correction,
  finished-item removal, and equipment rename. Independent SQL matched each answer.
  Evidence: `four-tool-host-check.json`. Host was Instant; exact model is unknown.

Artifacts: `tool-surface-pair.json`, `tool-composition-pairs.json`,
`four-tool-final-model-check.json`. Scores measure those cases and runs only.

## The repeatable learning loop

Use the local MCP/SQL fixture to grade requested effects independently of tool
sequence. Check each turn for additions, totals versus deltas, removal, duplicates,
and forbidden effects. Grade truthful write confirmations separately; manually
inspect uncertain model-judge flags. Add observed failures to regression coverage
and reserve fresh cases before tuning. Use Luna for the actor per user direction.

OpenTelemetry supplies command/tool/HTTP outcome counts, latency, and correlated
traces; it does not determine whether the model fulfilled a user request. The eval
harness supplies that task evidence plus model usage/cost. Keep both. Setup is in
`evals/kitchen/README.md` and `docs/OBSERVABILITY.md`. No paid telemetry backend,
Supabase/Vercel upgrade, model-provider migration, or spending ledger is needed
for this local loop.

## Rollout work left distinct from this decision

Keep PR #208 draft and the baseline available until review/integration. Full
persistent-dependency-failure injection is not wired into the four-tool model
adapter; deterministic rollback tests do not replace that behavior test. Complete
that release check, add structured output schemas (ChatGPT recommends them), and
port/reconcile the stacked PR against the current main SDK/toolchain before
rollout. Receipt-image extraction quality, huge inventories, unit conversion, and
production telemetry retention are outside this comparison. No merge, deployment,
or removal of user data is implied by this decision.
