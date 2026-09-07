# Tool-surface comparison — in progress

The user’s stopping point is a recommendation: decide which tool variation best
serves Mise’s actual kitchen workflows, explain what and why, then stop.
This is not authorization to adopt or deploy the experimental implementation.

## Decision method

Compare complete tool interfaces, not a claim that tool count alone causes success.
The candidate also changes input grouping, descriptions, batch support, request
identity, and replay behavior. Those differences must be disclosed.

The first paired run uses Luna with the same low reasoning setting, fixed answer
judge, output/tool-loop limits, isolated local Postgres stack, source hash, and
23 non-fault natural-language scenarios. Run baseline then four-tool candidate.
Calls use actual MCP HTTP and owned database writes. Initial/intermediate/final
SQL snapshots independently check effects. Both preserve cached API usage metrics.

Three fault scenarios are excluded from this first pair, explicitly. The existing
12-tool fault evidence does not establish equivalent candidate fault coverage.
The candidate’s transaction/replay tests provide separate deterministic evidence.

Record task and answer outcomes, unnecessary clarifications, calls, latency,
input/output/cached tokens and costs. A small sample is not a universal reliability
rate. If a result turns on a single failure, repeat or diagnose it rather than
assuming the aggregate score is decisive.

Before recommending adoption, inspect additional coverage for mixed groceries,
receipt proposal versus confirmation, equipment edits, finished-item removal, and
actual ChatGPT selection. Four tools currently do not preserve a mixed
create/restock receipt in one call; count that limitation explicitly. Do not
present the incomplete receipt surface as equivalent to the existing receipt tool.

## Evidence so far

- Baseline host: authenticated empty read passed; unqualified mayo add incorrectly
  demanded quantity and made no add call. Explicit unknown quantity then succeeded.
- Four-tool wire/DB test: exactly four tools, OAuth metadata, fail-closed anonymous
  request, and unknown-quantity add/read passed.
- Candidate service: atomic writes and durable retry tests pass, including delayed
  relative replay after the quantity returns to its original value.
- Four-tool Luna `add-unknown` smoke passed. No winner is established from this.
- First paired run completed at identical source hash; see `tool-surface-pair.json`.
  Baseline: 23/23 state and combined passes, 45 calls, median actor 4352 ms,
  actor estimate $0.01198494. Four: 22/23 state, 21/23 combined, 42 calls,
  median actor 4042 ms, actor estimate $0.01022203. Including the fixed judge,
  estimated totals were $0.03658044 versus $0.04243078; four was not cheaper overall.
- Four's state failure stored "half a jar" as text rather than 0.5 jar. The shorter
  candidate omitted the baseline's explicit preference for numeric fractions.
  This is a descriptor/representation regression, not evidence that four tools
  inherently fail. Preserve the failed run when evaluating a guidance correction.
- Four's second flag was a judge uncertainty about an omelette serving size; all
  state/authorization checks passed. No manual override was applied.
- Model tool-definition JSON: baseline 18,223 bytes, four 8,108 bytes. These are
  bytes, not token counts. Wire catalog size is a different measurement.
- No winner yet: candidate host acceptance and focused quantity follow-up remain.
