# Review of parallel architecture proposals — 2026-09-06

Reviewed the user's research summary and current issues #203, #201, #197, #206.
This review proposes an execution order; it does not authorize a production
migration or assert that the proposed tool count has won an experiment.

## Keep the useful direction; verify the claims

Keep flexible quantities, stable identity, deduplication, fewer overlapping verbs,
and deliberate deferral of expiry and backend recipe matching. The user separately
chose removing fully finished items from active pantry; the candidate now supports
that intent. This is a product simplicity decision, not proof that zero rows are
inherently incorrect or expensive. An in-stock read could filter zero quantities
if a future shopping-history feature needs to retain them.

The pasted numerical BFCL claims (25% accuracy loss above ten tools; universal
3–5-tool optimum at 98%) were not substantiated by the primary sources inspected.
Do not carry them into project requirements. BFCL V3 supports graph-derived,
multi-turn tasks, missing-parameter checks, and actual post-execution state
verification. It does not establish those universal tool-count rules.

Anthropic recommends selective, coherent tools and empirical evaluation, including
consolidating workflows where useful. OpenAI's tool guidance similarly starts with
user goals and separates differing permissions/risks. Neither source says all
flat schemas avoid errors or a three-tool design guarantees accurate inventory.
An adjust tool with quantity-or-remove fields still has conditional semantics even
if its JSON schema avoids a visible union. Add-versus-restock ambiguity also remains.

MCP annotations are hints. Read-only does not mean universally auto-approved, and
destructive does not mean every host always asks. A broad mutation tool must
truthfully describe all its effects; verify actual ChatGPT permission behavior.

## Issue-level recommendations

- **#203:** Convert the fixed four-tool commitment into a comparison of the current
  surface and a compact intent-based candidate. The issue still contains
  `check_recipe_readiness`, contradicting the latest supplied direction; drop it
  from the candidate. Preserve equipment add/edit/remove, pantry renames,
  present-versus-purchased semantics, typed quantity arithmetic, ownership,
  reviewed receipt confirmation, operation identity, and atomicity. Three
  food-oriented tools do not automatically cover the whole existing kitchen.
  Keep old descriptors off the compact candidate's advertised catalog: exposing
  aliases alongside new tools defeats the reduction. A separate candidate
  endpoint/version can preserve rollback without presenting both catalogs.
- **#201:** Make this a measured deployment experiment after the workflow/tool
  comparison. Current production route is `/mcp`, not `/api/mcp`. The issue provides
  no Mise measurements supporting 1.5–3s cold starts, global <50ms round trips,
  or the <100ms end-to-end target. Worker startup does not remove OAuth, network,
  database-region, model, or host orchestration time. Measure each segment and
  cold/warm p50/p95 before choosing Hono/Workers/Hyperdrive or changing vendors.
- **#197:** Its documented choice to retain the existing linter and add optional
  related tests is proportionate. Preserve full relevant validation at delivery.
- **#206:** Its reported timing breakdown targets an identified CI bottleneck;
  this is the right shape of infrastructure optimization. Closed status alone
  does not prove the timing target; use the actual resulting CI run to assess it.

Current local artifact measurement: 12 tools; full serialized catalog 54,242 UTF-8
bytes; actor function definitions 18,223 bytes. Bytes are not tokens. The model
adapter excludes output schemas and some catalog metadata, so a 53KB wire payload
is not itself a 53KB model prompt. A proposed 95% saving needs a measured candidate.

## Execution order

1. Finish actual host/account-linking acceptance and improve everyday multi-turn
   cases (unknown purchase amount, correction, mixed intake, ambiguous matches).
2. Compare compact tool candidates against that suite with Luna, checking task
   completion, unnecessary clarification, forbidden effects, schema tokens,
   actual billed cache usage, tool round trips, latency, and replay safety.
3. Resolve the observed answer-judge inconsistency independently of actor choice.
4. Benchmark deployment alternatives only if traces identify hosting as a material
   bottleneck. Preserve Supabase ownership/RLS and data through any comparison.

## Model decision and measured comparison

User requested Luna as the evaluation actor. The default is now `gpt-5.6-luna`;
mini remains selectable as the historical baseline. The answer judge is unchanged
so the actor experiment does not also change its evaluator. Terra is a possible
later judge/reference comparison, not an assumed improvement.

Two alternating passes across seven everyday cases per model, same source and
low reasoning, standard service, max output 2048, provider caching enabled:

| Actor | Task successes | Median actor task time | Normalized actor cost for 14 tasks |
| --- | ---: | ---: | ---: |
| GPT-5.4 mini | 14/14 | 2.612 s | $0.026094 |
| GPT-5.6 Luna | 14/14 | 3.991 s | $0.006367 |

Luna actor cost was about 76% lower; observed median latency was higher. Including
the fixed judge, estimated totals were $0.039588 and $0.020191 respectively.
Normalize both models using reported cache reads/writes; do not compare mini's
historical uncached ledger estimate with Luna's cached cost. The ledger remains
conservative and was not refunded. Cumulative charged estimate: $1.453669 of $5.
See [model comparison evidence](model-comparison.json). Fourteen observations per
model are screening evidence, not a reliability guarantee or recipe/voice test.

## Primary sources inspected

- [BFCL V3: multi-turn and graph construction](https://gorilla.cs.berkeley.edu/blogs/13_bfcl_v3_multi_turn.html)
- [BFCL V2: live data](https://gorilla.cs.berkeley.edu/blogs/12_bfcl_v2_live.html)
- [Anthropic: writing effective tools](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [OpenAI: define tools](https://developers.openai.com/apps-sdk/plan/tools)
- [MCP: annotation limits](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/)
- [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
