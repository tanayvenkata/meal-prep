# Kitchen evaluation foundation

Work tracked in [#191](https://github.com/tanayvenkata/meal-prep/issues/191).

The first layer verifies effects through an actual MCP SDK client, HTTP transport,
tool validation, kitchen service, restricted database connection, and local Postgres.
Run with Node 24 and the local Supabase stack:

```sh
npx vitest run src/__tests__/lib/kitchen-mcp.integration.test.ts
```

Each case creates a random synthetic user, binds a server to loopback, performs
writes through MCP, queries the resulting database state, and removes its fixtures.
The admin connection is only for fixture setup, independent state inspection, and
cleanup. Application writes still use `mise_app` and its authorization boundary.
Authentication is injected; these checks do not verify OAuth or ChatGPT behavior.

Twelve scripted cases cover unknown quantity, duplicate add, rename, stale rename,
exact fractional quantity, immediate consume retry, invalid input, equipment,
atomic batch rejection, read-only context, descriptive quantities, and clearing
quantities. Passing them is a protocol/database
baseline, **not a model task-success score**. In particular, an explicit `0.5 jar`
does not establish that vague estimates can be represented faithfully, and immediate
retry coverage does not establish durable idempotency after intervening writes.

The model layer uses ten versioned natural-language scenarios in `scenarios.ts`.
Run `npm run eval:kitchen` (or append `-- add-unknown` for one scenario). This
spends API credits using `OPENAI_API_KEY` from the environment or Doppler, and writes
reports into ignored `.eval-results/kitchen/`. It is deliberately outside CI.
Promptfoo 0.122.2 provides evaluation orchestration and assertion reports. Its
installed OpenAI chat MCP callback
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

The persistent budget ledger reserves $0.32 before each request, covering the
model's entire context window plus the configured maximum output. Known usage
replaces the reservation with an estimate at uncached rates; uncertain requests
retain their reservation. SDK retries are disabled. The cumulative limit is $5.
Do not delete/reset the ledger to bypass that limit. A concurrent-run lock fails
closed; after a crash, first verify the old process is gone before removing only
`run.lock`. Keep `budget.json`. This caps this runner's spend, not other use of the
same API account. Prices were checked on 2026-09-06 against the official
[model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

Only synthetic kitchen data is sent to the model or written into these reports.
The app's existing Supabase and Vercel plans are unchanged. API evaluation through
an MCP-to-function adapter is not identical to ChatGPT's host orchestration.

The [observability guide](../../docs/OBSERVABILITY.md) covers correlated command/tool
traces, the free local Grafana viewer, the no-model smoke command, and Inspector.
The budget guard now has deterministic tests for concurrent runs, unknown charges,
invalid usage, changed/corrupt ledgers, and duplicate settlement. Reservations are
written atomically and rounded conservatively to microdollars. `run.lock` records
the owner PID; verify that process is gone before removing a stale lock.

Actual ChatGPT acceptance and stronger held-out/model-answer tests remain separate
from passing scripted protocol and state checks.

## Answer-grader calibration

Run `npm run eval:kitchen -- --calibrate-answers` before relying on answer scores.
This makes twelve paid judge requests against reference cases in
`answer-cases.ts`; expected labels and case IDs are withheld from the judge.
Cases distinguish truthful failure from false success, unknown from invented
quantities, and a preexisting item from a write whose response was lost. One exact completion answer was adjudicated as acceptable by the user; the other
reference labels remain agent-authored and open to independent human review. Agreement on known cases is not
held-out accuracy or a guarantee that the judge will catch every misleading answer.

Normal scenario runs make one additional judge request and charge it to the same
atomic cumulative budget ledger as actor requests. Reports retain the rubric
version, model snapshot, explanation, usage, and cost. The judge has no tools or
database access; it cannot replace deterministic effect checks or modify inventory.
No model calls run in CI. The grader's parser, evidence-field selection, incomplete
responses, and budget/failure behavior are tested without an API key.

When running experiments across worktrees, share the existing `.eval-results`
directory and its lock/ledger instead of starting a fresh $5 allowance per checkout.
Only run one paid evaluation at a time. Never reset the ledger to repeat a run.

## Failure handling and fresh validation

`npm run eval:kitchen -- --recovery` runs two explicit fault cases. The first
executes a real local add and withholds its successful result from the model once;
the next tool call must read state. The second injects a persistent service failure
before create can write. The reports preserve actual server results separately
from what the model observed. Adapter response loss is not a real network outage
or ChatGPT host simulation.

`npm run eval:kitchen -- --validation` runs four fresh validation prompts registered
before their first observed results. `npm run eval:kitchen -- --all` runs all 16
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
