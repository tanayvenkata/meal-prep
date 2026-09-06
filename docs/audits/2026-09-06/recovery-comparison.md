# Recovery: measured instruction change

2026-09-06. The runner now exercises two failure boundaries with real local
MCP-to-database calls and separately scores effects and answer grounding.

## Before

In `lost-add-response`, the initial pantry was empty. The adapter executed a real
add, withheld its successful response, and returned an effect-unknown error. The
actor reread state, leaving exactly one Mayo, but answered “Mayo is already in your
pantry.” The judge flagged its implication that Mayo predated this request. The
scenario failed answer acceptance despite correct state.

In `unavailable-add`, the injected create service threw before any write. The
pantry stayed empty and the actor truthfully reported failure. This satisfied
failure-handling acceptance; it did not complete the requested task.

## Change

Add recovery guidance to the MCP server's initialization instructions: after an
uncertain write, reread before retrying, report confirmed current state, and do not
infer that an item predated the request or that a response failure means nothing
was saved. Tool schemas, authorization, and database behavior are unchanged.

This uses the SDK's existing initialization instructions rather than a new tool or
protocol adapter. Tool descriptions and instructions are part of the model-facing
contract; see the [official tool-design guidance](https://developers.openai.com/plugins/plan/tools).

## After

One run of 16 cases accepted all scenarios: 15 completed tasks and one expected
safe failure. The ten original cases remained successful. Four fresh validation
prompts, registered before their first observed results, also passed. These are
now observed cases and must not be described as held out after further tuning.

The Mayo response became “Added mayo to your pantry. Quantity is unspecified for
now.” The fresh Dijon mustard case confirmed its present saved state and unknown
quantity. Both left one item and reread after the withheld result. Persistent
failure still left the pantry unchanged and was reported honestly.

- [Before evidence](recovery-before.json)
- [After evidence](recovery-after.json)
- 250 unit tests, TypeScript, and lint pass.
- 14 real MCP/database integration cases pass.
- Official Inspector initialization, catalog, descriptive add, and quantity-clear
  smoke pass on the modified server.
- Cumulative charged estimate: $0.658611 of the authorized $5 cap.

## Limits and rollback

This is a small before/after experiment, not a statistical reliability claim.
The answer judge remains fallible. Response loss is injected by the evaluation
adapter, not by disconnecting a network or reproducing ChatGPT's orchestration.
Authentication in these synthetic fixtures is injected. Actual authenticated
ChatGPT acceptance remains unverified.

`taskMetrics` separates task successes from safe failures. Promptfoo's acceptance
success count must not be presented as a task completion count. The bounded loop
also rejects incomplete responses before dispatch, permits argument correction,
and exposes sanitized transport errors for recovery; its behavior is specific to
this evaluation host adapter.

Rollback the added initialization guidance to compare old behavior; the two
versioned failure cases remain runnable and should expose the regression. No
database migration, vendor change, merge, or production deployment is required.
