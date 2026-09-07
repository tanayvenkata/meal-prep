# Four-tool experiment — issue #203

Status: input contracts and tested transaction/retry primitives. Service handlers execute local writes and the four-tool catalog is selectable with `MISE_TOOL_SURFACE=four`; baseline remains the default
and have not been evaluated by a model. The baseline remains the 12-tool server.

The candidate is a tool-only app: `read_kitchen`, `add_items`, `edit_items`, and
`remove_items`. Pantry includes food and spices; equipment uses the same command
names with its own collection discriminator. No old aliases should be advertised
when selecting this candidate for evaluation.

## Behavior to preserve

- A named addition needs no quantity. Omitted quantity stays unknown.
- Presence/add is not arithmetic: an existing name returns already present.
- Replacement totals, increases, and decreases are distinct edit operations.
- Stable IDs and exact expected names protect edits/removals; relative arithmetic
  additionally requires a fresh measured quantity and a positive same-unit delta.
- Explicitly finished pantry items are removed; hypothetical cooking does not write.
- Lists execute atomically, with ordered outcomes. A rejected line rolls back all
  changes; successful earlier lines must not be narrated as saved after rollback.
- Every write has a request UUID. An identical retry returns its historical outcome;
  reuse with different content rejects. This is a desired guarantee, not implemented
  merely by putting a UUID in the schema.
- Ownership comes from authenticated server context; caller identity is rejected.

## Implementation sequence

1. Input contracts and boundary tests (started).
2. Internal `withKitchenTransaction` now lets owned queries share one transaction,
   rejecting cross-user access and closed-context reuse. Four real-DB tests cover
   commit, rollback, identity mismatch, and closed scope. Command execution is still
   unwired. Existing database functions each
   open a transaction, so looping over them does not provide list atomicity.
   Reuse their validation and owned SQL while ensuring one transaction per list.
3. `runKitchenWrite` now persists terminal results with inventory effects. Nine
   isolated-Postgres tests cover transaction scope, replay, changed payloads,
   concurrent duplicates, owner-scoped IDs, rejection rollback, and infrastructure
   rollback. Migration 20260906235058 extends the existing receipt kind constraint
   without changing grants or RLS. Applied only to the isolated local test stack.
   The add/edit/remove service handlers now convert domain failures into list
   rejection, lock target rows in consistent order, preserve stable IDs, and
   omit user identity from results. Thirteen local transaction/command tests pass.
   The adapter translates measured quantities into the existing service format.
4. Preserve mixed create/restock receipt imports within the four-tool surface:
   explicitly reviewed line decisions, one transaction, and one request identity.
   The current candidate schema does not yet cover this requirement.
5. Register a separate selectable candidate server using the same authentication,
   safe telemetry, and transport. Keep a reproducible baseline selection.
6. Adapt scenario instrumentation to compare semantic operations, rather than
   hard-coded legacy tool names. Fault injection and forbidden-write assertions
   must remain effective for the new tools.
7. Run deterministic transaction/ownership/retry tests, then the same 26 Luna cases,
   then list/receipt/equipment cases. Preserve comparable source/model evidence.
8. Refresh the synthetic ChatGPT connector and repeat host golden prompts. A
   passing API adapter does not resolve the observed Instant-host mayo failure.

Compare completed tasks, safe failures, false success, unintended/duplicate writes,
clarifications, call counts, latency, and per-run usage. No universal four-tool or
schema-byte threshold is assumed. Do not deploy or remove the baseline on the
strength of schema tests alone.

References: [tool planning](https://developers.openai.com/plugins/plan/tools),
[MCP server](https://developers.openai.com/plugins/build/mcp-server),
[reference](https://developers.openai.com/plugins/reference).

## Updated stopping point — user direction

Determine whether 12, four, or another tool variation best serves the kitchen
workflow, explain the evidence and tradeoffs, then stop. Complete only candidate
work needed for a valid comparison. Do not automatically adopt, merge, deploy,
or continue broader product work after reaching that decision.

Four-tool MCP HTTP smoke passes: exactly four advertised tools, unauthenticated
401, OAuth security metadata on the wire, unknown-quantity add, independent SQL
state, and a fresh kitchen read. Fourteen transaction/command/HTTP cases pass on
the isolated database. This is not yet a model comparison.
