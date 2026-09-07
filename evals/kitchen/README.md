# Kitchen evaluation foundation

Work tracked in [#191](https://github.com/tanayvenkata/meal-prep/issues/191).

The first layer verifies effects through an actual MCP SDK client, HTTP transport,
tool validation, kitchen service, restricted database connection, and local Postgres.
Run with Node 24 and the local Supabase stack:

```sh
pnpm exec vitest run src/__tests__/lib/kitchen-mcp.integration.test.ts
```

Each case creates a random synthetic user, binds a server to loopback, performs
writes through MCP, queries the resulting database state, and removes its fixtures.
The admin connection is only for fixture setup, independent state inspection, and
cleanup. Application writes still use `mise_app` and its authorization boundary.
Authentication is injected; these checks do not verify OAuth or ChatGPT behavior.

Fourteen scripted cases cover unknown quantity, duplicate add, rename, stale rename,
exact fractional quantity, immediate consume retry, invalid input, equipment,
atomic batch rejection, read-only context, descriptive quantities, and clearing
quantities, committed-response recovery, and cross-user write rejection. Passing them is a protocol/database
baseline, **not a model task-success score**. In particular, an explicit `0.5 jar`
does not establish that vague estimates can be represented faithfully, and immediate
retry coverage does not establish durable idempotency after intervening writes.

The model layer uses ten versioned natural-language scenarios in `scenarios.ts`.
Run `pnpm run eval:kitchen` (or append `add-unknown` for one scenario). This
spends API credits using `OPENAI_API_KEY` from the environment or Doppler, and writes
reports into ignored `.eval-results/kitchen/`. It is deliberately outside CI.
Promptfoo 0.122.2 provides evaluation orchestration and assertion reports. Its
unused optional Codex Security and Hugging Face Transformers integrations are
excluded in `pnpm-workspace.yaml` to remove vulnerable transitive dependencies
(Dependabot alerts #48–54). Kitchen evaluations use a custom provider and
JavaScript assertions; `pnpm run test:eval-dependencies` checks that path offline
in CI. Reassess the exclusions and upstream security fixes before adding either
integration or local Transformers embeddings.

Its installed OpenAI chat MCP callback
path executes tools and returns their content without completing a subsequent
model turn, so `run.ts` uses the official OpenAI SDK for at most six model turns
and twelve tool calls. Response caching is disabled. Each report records the model
snapshot, code hash, tool results, final state, latency, usage, and estimated spend.
Deterministic checks cover exact final inventory, forbidden writes, and stable
identities. A separate model judge grades the factual grounding of the final answer
against the initial/final database snapshots and tool results. Reports expose
`statePass` and `answerPass` separately; overall `pass` requires both. A missing,
incomplete, or uncertain judge verdict cannot pass. This is a fallible model
assessment, not proof of truthfulness, and it does not assess recipe quality.

By user direction on 2026-09-06, normal evaluations have no cumulative spending
cap or persistent ledger. Reports automatically retain per-run token usage and
known estimated costs. Missing usage is marked unknown, not counted as free.
Historical `budget.json` files and earlier capped-run reports are archival only;
normal runs neither read nor update them. SDK retries remain disabled, and request,
tool-call, output-token, and timeout limits still bound each scenario.

Only synthetic kitchen data is sent to the model or written into these reports.
The app's existing Supabase and Vercel plans are unchanged. API evaluation through
an MCP-to-function adapter is not identical to ChatGPT's host orchestration.

The [observability guide](../../docs/OBSERVABILITY.md) covers correlated command/tool
traces, the free local Grafana viewer, the no-model smoke command, and Inspector.
Actual ChatGPT acceptance and stronger held-out/model-answer tests remain separate
from passing scripted protocol and state checks.

## Answer-grader calibration

Run `pnpm run eval:kitchen --calibrate-answers` before relying on answer scores.
This makes twelve paid judge requests against reference cases in
`answer-cases.ts`; expected labels and case IDs are withheld from the judge.
Cases distinguish truthful failure from false success, unknown from invented
quantities, and a preexisting item from a write whose response was lost. One exact completion answer was adjudicated as acceptable by the user; the other
reference labels remain agent-authored and open to independent human review. Agreement on known cases is not
held-out accuracy or a guarantee that the judge will catch every misleading answer.

Normal scenario runs make one additional judge request and record its usage
separately from actor usage. Reports retain the rubric
version, model snapshot, explanation, usage, and cost. The judge has no tools or
database access; it cannot replace deterministic effect checks or modify inventory.
No model calls run in CI. The grader's parser, evidence-field selection, incomplete
responses, and usage/failure behavior are tested without an API key.

When running experiments across worktrees, keep reports together for comparison.
Use matched source versions and fixtures; no shared spending lock is required.

## Failure handling and fresh validation

`pnpm run eval:kitchen --recovery` runs two explicit fault cases. The first
executes a real local add and withholds its successful result from the model once;
the next tool call must read state. The second injects a persistent service failure
before create can write. The reports preserve actual server results separately
from what the model observed. Adapter response loss is not a real network outage
or ChatGPT host simulation.

`pnpm run eval:kitchen --validation` runs four fresh validation prompts registered
before their first observed results. `pnpm run eval:kitchen --all` runs all 16
cases. Keep first-run results and do not call cases held out once used for tuning.

Recovery reports distinguish `taskSuccess`, `safeFailure`, and `acceptancePass`.
The persistent-failure case must leave the initial inventory unchanged, exercise
the injected fault, terminate, and give a supported explanation. Its expected safe
failure is accepted, but `taskSuccess` and `pass` remain false. The summary's
`taskMetrics` separates completed tasks from safe failures; Promptfoo success
counts represent scenario acceptance, not tasks completed.

The actor loop now lives in `conversation.ts`, with no-API tests for malformed
arguments, incomplete responses, provider/transport failures, and request/tool
limits. Incomplete responses never dispatch writes. Provider failures are not
retried; transport errors allow a subsequent model turn with effect-unknown
evidence. The adapter's recovery behavior is explicit and may differ from ChatGPT.

## Everyday workflow expansion

`pnpm run eval:kitchen --everyday` runs seven finished-item, purchase, total-correction, and
removal cases added after user workflow feedback. `--all` now includes these
alongside the original 16; earlier 16-case reports remain historical evidence.
Multi-turn clarification/correction remains pending;
passing this subset does not establish that broader coverage. See the
[coverage review](../../docs/audits/2026-09-06/everyday-workflow-coverage.md).

## Controlled model comparison

The actor defaults to `gpt-5.6-luna` by user request. Set
`KITCHEN_EVAL_MODEL=gpt-5.4-mini-2026-03-17 pnpm run eval:kitchen --everyday`
to rerun the historical mini baseline.
Only these priced actors are accepted. The answer judge remains fixed at mini
with the recorded rubric, so changing actors does not also change grading.
Luna usage estimates include reported cache reads/writes and the long-context
pricing threshold. Per-run usage reporting does not authorize or stop requests.

Reports include actor model, actor-only duration, actor cost, requests, tool calls,
actual provider responses/usage, source hash, and separate judge verdict/cost.
Mini retains its historical conservative uncached estimate; Luna prices reported
cache reads/writes and charges missing cache-write detail conservatively. State
this distinction when comparing estimated costs. Do not infer production ChatGPT
latency or recipe quality from these API kitchen-write cases.

## Multi-turn workflow checks

`pnpm run eval:kitchen --dialogue` runs three two-turn conversations: an
unspecified purchase followed by its amount, a correction to an absolute total,
and two distinct purchases of the same amount. `--all` includes all 26 cases.
The runner preserves actual assistant/tool history and supplies the next scripted
user message only after an assistant answer. It records independent database
snapshots and calls after each user turn. The missing-amount case forbids writes
before the follow-up; intermediate snapshots prevent a later correction from
hiding an incorrect earlier state. Model/tool limits cover the whole conversation.

These are scripted continuations, not a simulated human. The next message is
supplied regardless of the precise preceding answer. The judge checks factual
grounding across the recorded turns; it does not certify that each clarification
was necessary or well phrased. Review the recorded questions separately before
claiming clarification quality. No future user message is visible to the actor
until that turn.

## Comparing tool surfaces

`MISE_TOOL_SURFACE=four pnpm run eval:kitchen --workflows` selects the experimental
four-tool interface and the 23 non-fault cases. The application defaults to four;
the comparison runner retains baseline unless MISE_TOOL_SURFACE=four is explicit. Report
provenance records the surface and migration source alongside model/code hashes.
The --workflows selector excludes faults. Use --all for the 26-case corpus,
including response loss and injected persistent add-service failure on either
surface. Use --rollout for the three-spice purchase example (12 oz each).

An isolated local stack can be selected with `KITCHEN_EVAL_DATABASE_URL` and
`KITCHEN_EVAL_ADMIN_DATABASE_URL`. Both must target the same approved loopback
port (54322 or 55322), database postgres, with mise_app and postgres respectively.
Never put credential-bearing URLs in reports or committed configuration. Apply
candidate migrations to the isolated stack before running candidate writes.

Fresh composition comparison: run `evals/kitchen/run.ts --composition` using the
same authorized local configuration and `MISE_TOOL_SURFACE` selection described
above. This separate five-case set exercises multiple operations and equipment
lifecycle checkpoints. It is deliberately excluded from historical `--workflows`
and `--all` sets so their denominators do not silently change. Once used to tune
tools, treat it as regression coverage, not held-out evidence.
