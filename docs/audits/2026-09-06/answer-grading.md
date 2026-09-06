# Answer grounding: separate from kitchen effects

2026-09-06. This slice adds a supplementary model judge to the local evaluation
runner. It compares each final answer with initial/final database state and tool
results. Deterministic state checks remain independent and cannot be overridden by
the judge. Reports require both checks to pass, but retain both dimensions so a
failure is diagnosable.

Why: an earlier adapter response-loss experiment saved one Mayo correctly, then
the actor described it as already present. Correct final state did not establish
an accurate explanation of the operation. A safe failure can also be reported
truthfully despite failing to complete the requested task.

The rubric uses `supported`, `misleading`, and `uncertain`. Ten agent-authored
calibration cases cover those distinctions, fabricated quantities, empty answers,
and an instruction embedded in the answer attempting to influence the grader.
Expected labels and case IDs are excluded from judge inputs.

## Evidence

- First calibration: 10/10 agreement with reference labels, including the observed
  misleading Mayo explanation. These labels have not received independent human
  review; this is calibration on known examples, not held-out accuracy.
- Existing natural-language baseline: 10/10 deterministic checks and 10/10
  supported-answer grades in one run. No production tool behavior was changed.
- 241 unit tests pass, including 13 new no-API grader/parser/budget tests.
  TypeScript and repository lint pass.
- Cumulative charged estimate after both paid runs: $0.496407 of the existing $5
  cap. Judge calls use the same persistent atomic ledger, conservative reservations,
  fixed model snapshot, and disabled SDK retries as actor calls.

The [machine-readable evidence](answer-grading-verification.json) preserves source
hashes, model/rubric versions, judgments, answers, and usage. Detailed synthetic
transcripts remain in the ignored local report directory. This slice lives in an
isolated worktree because concurrent MCP migration edits affected the original
checkout. No migration changes were included or overwritten.

## Limits and next checks

A judge can be wrong, share the actor's biases, or be influenced by supplied text.
One injection control does not prove injection resistance. Review disagreements
and sample apparently supported answers. Add independent reference labels and
held-out cases before trusting an aggregate quality percentage.

The subsequent [recovery comparison](recovery-comparison.md) restores the full
response-loss scenario, exercises persistent dependency failure, and measures a
focused instruction change through the combined runner. Actual authenticated ChatGPT behavior remains
a separate host-acceptance requirement. Nothing in this report establishes that
the production deployment or ongoing MCP migration has passed those checks.
