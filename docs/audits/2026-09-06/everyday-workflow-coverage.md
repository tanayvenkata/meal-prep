# Everyday pantry coverage and model comparison

User steering, 2026-09-06: prioritize ordinary additions, removals, finished items,
and buying more of an existing item. Quantity-description experiments are useful
edge coverage, but are not representative of the user's main workflow.

## Coverage model

Evaluate intent × current state × available information × execution outcome.
Use representative transitions and high-risk combinations rather than every
possible sentence. Multiple conversational turns are required to test clarification,
correction, and a later purchase separately from a retry.

| Everyday intent | State variations | Expected behavior / open decision | Current model-suite coverage |
| --- | --- | --- | --- |
| I have mayo; add it | Absent / already present | Save presence; preserve existing quantity on duplicate | Covered |
| Bought 12 more eggs | Present with count / unknown amount / absent | Add to known count; never invent the previous amount | Known-count and absent cases added; unknown baseline remains missing |
| Add eggs | Already present | Do not silently assume a new purchase or add an arbitrary amount | Duplicate Mayo analogue only |
| Bought more eggs | Present, delta unspecified | Clarify amount if tracking counts; never fabricate a delta | Scripted two-turn amount case added; unknown existing amount remains missing |
| Eggs are finished | Known quantity / unknown / already zero / absent | User chose removal on 2026-09-06; partial use is not removal | Finished-item case added; baseline incorrectly retained zero |
| Remove the mayo | One match / ambiguous matches / absent | Remove intended item; avoid guessing among plausible matches | Present/absent cases added; absent first run asked unnecessary clarification |
| I have 12 eggs now | Existing count differs | Replace total, unlike “12 more” | Added alongside purchase-more comparison |
| I used two eggs | Sufficient / insufficient / unknown count | Subtract known delta, reject impossible arithmetic or clarify | Happy path covered; boundaries missing from model suite |
| Plan dinner with eggs | Available / finished | Read only; don't infer consumption | Covered for available eggs |
| Actually, I meant six | After clarification / after committed write | Resolve which prior quantity is being corrected; preserve identity | Scripted total-correction case added; ambiguous referents remain missing |
| Save this shopping haul | Mixed new/existing items; incomplete quantities | Distinguish creates from restocks and report partial/atomic semantics truthfully | Multi-add covered; mixed purchase missing |
| Request times out | Write committed / not committed / concurrent update | Read before retry; distinguish success, safe failure, unknown effect | Two injected fault cases; concurrency remains limited |

Keep the existing 16-case evidence as a historical baseline. Do not relabel it as
broad everyday-workflow coverage. Seven purchase/remove/finished scenarios are now registered. First-run evidence
is in everyday-before.json: five of six purchase/removal cases passed, while
the separate finished-item case retained zero instead of removing it. Unknown
product semantics must be resolved explicitly rather than grading today's tool behavior
as correct by definition. Keep deliberate no-write and necessary clarification
outcomes separate from completed writes. Track unnecessary clarification too.

Prioritize: (1) restock versus total replacement and duplicate intent; (2) finished
and remove semantics; (3) multi-turn clarification/correction; (4) mixed purchases;
(5) boundary, retry, and concurrent-state variants. For each, assert independent
state, forbidden effects, narration, tool calls, turns, latency, and cost. Preserve
fresh paraphrases for validation after tuning.

## Model choice checked against current official documentation

GPT-5.4 mini is the measured actor/judge baseline, not an established optimum.
This API choice does not select the model used by the user's ChatGPT host.

Standard token prices, USD per million, short context without caching:

| Candidate | Input | Output | Role in comparison |
| --- | ---: | ---: | --- |
| GPT-5.4 mini | 0.75 | 4.50 | Existing measured baseline |
| GPT-5.6 Luna | 0.20 | 1.20 | First cost-sensitive challenger |
| GPT-5.6 Terra | 2.00 | 12.00 | Optional stronger reference if cheaper models miss tasks |

Luna is about 73.3% cheaper for equal uncached input/output token counts. This is
not a measured task-cost or speed improvement. Its documentation describes it as
a cost-sensitive model roughly corresponding to the earlier nano tier. It supports
function calling and structured outputs. Cache-write charges and long-context
rates differ from mini; update budget accounting before any model switch.

Compare on the same everyday cases and source snapshot, with fixed settings,
repeated runs, identical state assertions, and a fixed calibrated judge. Report
cost per successful task, completion latency, false-success/duplicate/unauthorized
write rates, and clarification quality. Do not switch actor and judge together:
that would confound the comparison. Keep the shared cumulative $5 ceiling and
existing ledger. No new model run or migration was performed for this review.

Sources fetched 2026-09-06:
- [Official pricing](https://developers.openai.com/api/docs/pricing)
- [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Current model guidance](https://developers.openai.com/api/docs/guides/latest-model)

## First measured result

Before the user-directed finished-item change: 5/6 everyday purchase/removal cases
passed; removing absent Mayo prompted unnecessary clarification without a read.
The separate finished-item case kept Eggs at zero, contrary to the user's choice.
After changing the existing pantry-delete description and one initialization
clause: all seven everyday cases passed once. No database or tool-count change.

The full 23-case rerun accepted 22: 21 completed tasks and one expected safe
failure. One correct lost-response recovery was flagged by the answer judge despite
its ordinary-confirmation rule. Preserve that raw failure and evaluate judge
consistency separately; a single run is not a reliability estimate. Cumulative
model spend is $1.295346 of the existing $5 allowance.

Three two-turn cases subsequently passed on Luna, preserving intermediate state:
purchase amount clarification (4 → 4 → 16), correcting a total (4 → 12 → 10), and
two distinct purchases (4 → 10 → 16). The first answer was inspected and asked
how many eggs were bought without writing. Broader ambiguity and mixed-purchase
coverage remain open; these scripted conversations do not simulate arbitrary users.
