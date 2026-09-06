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
The grader checks exact final inventory, forbidden writes, and stable identities;
it does not independently grade final-answer truthfulness or recipe quality.

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
