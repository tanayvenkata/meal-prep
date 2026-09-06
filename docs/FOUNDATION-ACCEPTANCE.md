# Kitchen foundation acceptance

Reviewed 2026-09-06 against issue #191 and the objective: make core kitchen writes
measurable, reliable, and easy to improve through a repeatable local evaluation loop.
This is the current acceptance index; historical experiment reports are evidence,
not instructions or permanent product requirements.

| Requirement | Evidence | Status |
| --- | --- | --- |
| Repeatable local command | `pnpm run eval:kitchen --all`; isolated synthetic users, actual MCP HTTP client and local restricted Postgres writes | Verified on the pnpm dependency baseline |
| Versioned natural-language cases | Ten baseline, two fault, four observed validation cases in `evals/kitchen/scenarios.ts` | 16/16 scenario acceptance: 15 tasks completed, one expected safe failure |
| Effects independently checked | Initial/final SQL snapshots, expected state, duplicate prevention, stable identities, forbidden writes; 14 real MCP/database cases | Verified; not a guarantee for every possible retry history |
| Semantic outcomes and correlation | Command/tool/HTTP outcomes, safe logs, OTel traces and local Grafana collector; `docs/OBSERVABILITY.md` | Local evidence available; production collection not deployed |
| Answer correctness evaluated | Versioned grader, explicit false-success controls, 12 calibration examples, one user-adjudicated answer | Implemented; fallible model score, most labels remain agent-authored |
| Failures and recovery observable | Response-loss and persistent-service-failure cases; actual server result distinguished from model observation | Verified in the evaluation adapter, not ChatGPT |
| Reproducibility and spend | Model snapshot, source/catalog/instruction hashes, pnpm lock/config hash, usage and shared atomic ledger | Recorded; cumulative estimate $1.007678 of $5 |
| Comparable simplification experiment | `docs/audits/2026-09-06/kitchen-evaluation.md`: quantity uncertainty before/after | Recorded; existing schema columns reused |
| Automated validation | 250 unit tests, 181 integration tests, TypeScript and lint on reconciled pnpm branch; pre-push build | Local checks pass; current remote CI must pass after base reconciliation |
| Real host/account linking | Updated `docs/mcp-golden-prompts.md`, including unknown/text/cleared quantities | Pending actual authenticated ChatGPT development check |
| Review and rollback | Draft PRs #192, #194, #198; reversible code changes, no migration/vendor change | Delivered for review; not merged or deployed |

Latest combined-run evidence:
[pnpm foundation verification](audits/2026-09-06/pnpm-foundation-verification.json).
Earlier instruction experiments were rejected; product initialization instructions
remain unchanged. The user's answer adjudication corrected an overly strict grader
without adding product prompt complexity.

## Remaining acceptance

Finish current CI after reconciling the rebased pnpm base, then run the relevant
golden prompts in a fresh ChatGPT development conversation with the matching
candidate metadata. The local standalone server and ngrok were not running at
this review; do not report host acceptance based on the API adapter, Inspector,
or an older production connector. Record the exact endpoint/commit, safe before/
after evidence, and any host/account-linking failures.

## Deliberate limits

This foundation measures a small set of workflows, not universal model reliability.
Known delayed relative-write retry/ABA limitations remain documented in PROJECT.md;
immediate-retry tests do not establish durable idempotency for those operations.
Production telemetry retention and paid services remain separate decisions. No
evidence currently justifies switching database vendors or giving the model an
unrestricted pantry shell. Evaluate such alternatives against the same workflows
when a measured limitation motivates them.
