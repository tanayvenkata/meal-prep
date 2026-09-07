# Recovery evaluation: first observation

Date: 2026-09-06. Model: `gpt-5.4-mini-2026-03-17`.

Question: after an add commits but its successful result is withheld, will the
model reread state, avoid a duplicate, and explain what happened accurately?

The experimental `lost-add-response` scenario starts with an empty synthetic kitchen
and asks “i have mayo pls add”. The evaluation adapter executes the real MCP call
against local Postgres, then returns an effect-unknown transport error to the model.
This is an injected host-adapter failure; the actual MCP server returned success.

One run made three model requests and two tool calls:

1. `add_pantry_item` committed Mayo; its result was withheld.
2. `get_kitchen_context` returned the saved Mayo.

Final database state contained exactly one Mayo, with unknown quantity. The model
answered: “You already have **mayo** in your pantry, so I didn’t add a duplicate.”

Mechanical checks passed, but human review flags the explanation as misleading:
Mayo did not preexist this request. The failed-response operation created it. A
grounded answer could confirm that Mayo is now saved while acknowledging uncertainty
about the first response. This example demonstrates why state correctness alone
does not establish answer truthfulness.

This run cost an estimated $0.009939. The cumulative ledger reached $0.402363 of
the authorized $5 cap. Full source provenance, catalog, model transcript, tool
results, and initial/final state are retained in the ignored local report directory.

Next: add separately reported answer-quality grading, calibrated against manually
labeled truthful and false-success examples. Keep deterministic database checks
authoritative for effects. Do not tune tool instructions from one observation or
count this single recovery case as broad reliability evidence.

## Checkout limitation

After this run, concurrent checkout changes removed the experimental runner and
its tests. This observation preserves the measured result, but the recovery command
is not currently available in this checkout. Restore the experiment in an isolated
worktree and rerun validation before publishing implementation claims. The run
passed 237 unit tests before the concurrent removal; that result does not verify
the current MCP migration changes.
