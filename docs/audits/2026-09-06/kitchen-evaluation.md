# First kitchen evaluation experiment

Issue: [#191](https://github.com/tanayvenkata/meal-prep/issues/191).
Runnable instructions: [evaluation README](../../../evals/kitchen/README.md).
Machine-readable evidence: [results](kitchen-evaluation-results.json).

## Question and result

Can realistic kitchen requests produce the intended database effects, and can a
small contract change fix demonstrated failures without breaking existing tasks?

| Contract | Inventory-effect checks passed | Observation |
| --- | --- | --- |
| Original | 8/10 | Cannot clear quantity or preserve “a little left” |
| Add descriptive/unknown quantity variants | 9/10 | Both gaps fixed; half a jar stored as text |
| Clarify numeric fractions versus vague descriptions | 10/10, repeated three times | All ten cases pass on each run |

The original model explicitly said it could not set quantity to unknown. For
“a little left,” it added Rice but discarded the description. Neither failure
was an HTTP/server crash. After exposing the existing domain representations,
the first candidate preserved uncertainty but chose text for an explicit half
jar. The final descriptor directs explicit numbers/fractions to numeric quantities.

The implementation changes only pantry add/update schemas, descriptions, and
their mapping to the existing service input. Existing exact input remains valid;
omitted update fields remain unchanged; explicit `{mode: "unknown"}` clears only
quantity. Relative arithmetic still requires structured quantities. No database
migration, vendor change, tool deletion, or production deployment was required.
Rollback is the focused `src/mcp/server.ts` contract change; existing data remains
valid under the current domain and database schema.

## Measurement and limits

Ten natural-language scenarios cover addition, duplicates, fractional quantities,
clearing quantity, consumption, rename, equipment, multiple additions, planning
without writes, and descriptive quantities. Each gets a fresh synthetic kitchen.
The official MCP client initializes and discovers the live tools; a bounded
Responses function-calling loop executes them over local HTTP. Independent SQL
reads grade the final inventory, forbidden mutations, and retained identities.
Fixtures use admin access for setup/inspection/cleanup; app writes use `mise_app`.

Model: `gpt-5.4-mini-2026-03-17`, low reasoning, 2,048 maximum output tokens per
request, maximum six model turns and twelve tool calls per scenario. Promptfoo
0.122.2 handles orchestration and assertions, with response caching disabled.
Total estimated API usage across the smoke test and five full suites: **$0.386037**,
conservatively treating all input as uncached. The authorized cumulative cap is $5.
There were no uncertain provider requests requiring retained reservations.

This is an initial regression set, not an estimate of production reliability.
Three repeats of ten known prompts are not independent coverage of all user
behavior. Exact final state does not prove truthful narration. Alias handling,
delayed retries, ambiguous equipment categories, OAuth, actual ChatGPT orchestration,
and user-facing cooking quality still need separate coverage. The original reported
Mayo failure remains historically unproven even though its local scenario passes.

## Validation and next slice

Node 24.20.0: 208 unit tests, 179 integration tests (including twelve new real
MCP-to-Postgres cases), lint, TypeScript, and production build pass locally.
The new integration file is picked up by the existing database CI lane. Model
evaluations remain opt-in and spend-limited; they do not run on every PR.

Next work is production outcome telemetry (including tool errors inside HTTP 200),
OTel correlation, stronger state/answer graders and held-out scenarios, budget and
runner failure-injection tests, plus MCP Inspector and actual ChatGPT acceptance.
This slice is a local candidate, not a production-ready completion of issue #191.
Avoid interpreting a passing suite as grounds for a backend rewrite or more features.

Sources checked: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling),
[model limits and pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[MCP server guidance](https://developers.openai.com/plugins/build/mcp-server), and
[tool design](https://developers.openai.com/plugins/plan/tools). The installed SDK
types and Promptfoo implementation were also inspected before selecting the adapter.
