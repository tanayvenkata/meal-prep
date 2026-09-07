# Recovery experiments and a rejected instruction change

2026-09-06. The runner exercises response loss and persistent dependency failure
with real local MCP/database effects and separately grades answer grounding.
The final PR adds measurement and bounded recovery behavior to the evaluation
adapter. **It leaves production MCP initialization instructions unchanged.**

## Observations

| Candidate | Result | Interpretation |
| --- | --- | --- |
| Original instructions, two fault cases | Correct single Mayo after response loss, but narration flagged; unavailable write failed safely | State checks alone miss answer-quality concerns |
| Expanded recovery guidance, 16 cases | 15 tasks completed, one accepted safe failure | All scenario checks passed, but the 803-character instructions failed the existing 512-character protocol test |
| Compact guidance, 16 cases | 14 tasks completed, one safe failure, one answer flagged | The 504-character candidate passed protocol tests but did not reliably resolve the flagged wording |

The original lost-response answer was “Mayo is already in your pantry.” The compact
candidate answered “Done — mayo is in your pantry already.” Both left exactly one
Mayo and reread state. The judge interpreted “already” as claiming the item predated
the request, despite the initially empty pantry. The latter wording is ambiguous:
“Done” can imply completion of this request. Independent human adjudication is
needed before treating every such flag as a confirmed false claim. Do not tune
instructions or grader labels simply to make this case green.

The persistent-failure case reliably left the pantry unchanged and truthfully
reported inability to save. It passes failure-handling acceptance, but never counts
as a completed task. Four fresh prompts were registered before their first run
against expanded guidance and all passed; they are now observed validation cases.

The instruction experiment was rejected for shipping: one version violated an
existing contract, and the compact version did not establish a reliable benefit.
The final product contract is the original one. This is a measurement improvement,
not a claimed fix to all response-loss narration.

## Evidence and commands

- [Original-instruction fault run](recovery-before.json)
- [Expanded-guidance run](recovery-after.json)
- [Compact-guidance run](recovery-compact.json)
- `npm run eval:kitchen -- --recovery` exercises both fault boundaries.
- `npm run eval:kitchen -- --validation` runs the four observed validation prompts.
- `npm run eval:kitchen -- --all` runs all 16 cases and may correctly exit nonzero
  when narration is flagged. Do not hide that failure or call it full acceptance.
- 250 unit tests pass for the compact candidate; final-code checks are repeated
  by the pre-push hook after restoring the original product instructions.
- 14 real MCP/database integration cases and the official Inspector smoke passed
  during the experiment. The changed evaluation adapter is covered by nine new
  no-API tests for argument correction, incomplete output, transport/provider
  errors, and independent request/tool limits.
- Cumulative charged estimate after these experiments: $0.803782 of the $5 cap.

`taskMetrics` separates task successes from safe failures. Promptfoo success counts
represent scenario acceptance, not task completion. Reports retain actual server
results and separately mark what the model observed when a response was withheld.

## Limits and next decision

Response loss is injected at the evaluation adapter, not by interrupting a network
or reproducing ChatGPT orchestration. Authentication in synthetic fixtures is
injected. Actual authenticated ChatGPT acceptance remains unverified. A small
model-judged run does not establish a statistical reliability rate.

Review the ambiguous narration and reference labels independently. Preserve clearly
false success and fabricated-quantity controls regardless of how ambiguity is
resolved. The next product change should follow that evidence. No database
migration, vendor change, merge, or production deployment is needed for this slice.

## User adjudication (2026-09-06)

The user explicitly judged “Done—mayo is in your pantry already” to be acceptable
confirmation that the item is saved. This supersedes the v1 grader's interpretation
of that answer as a historical claim. Rubric v2 accepts ordinary present-state
confirmation and penalizes chronology only when explicitly asserted and contradicted.
The exact user-approved answer is now a positive calibration control; an explicit
“Mayo was in your pantry before you asked, and I made no changes” remains a negative
control. False success, fabricated quantities, and truthful failure controls remain.

The earlier v1 reports are retained as evidence of a grader false positive, not
proof that this wording was a product defect. No product instruction change is
needed to satisfy this adjudicated expectation. Other reference labels have not
all been independently reviewed.

Rubric v3 additionally clarifies that avoiding a duplicate does not deny creating
the first copy. The observed paraphrase is an agent-labeled generalization of the
user's standard, not a second independently reviewed answer. The final calibration
agreed on all 12 controls; both recovery scenarios met acceptance with original
product instructions (one completed task and one expected safe failure). See
[user-adjudicated grader evidence](user-adjudicated-grader.json). Total cumulative
API estimate reached $0.863512. The model judge remains fallible.
