# Kitchen foundation acceptance

Reviewed 2026-09-06 against issue #191 and the objective: make core kitchen writes
measurable, reliable, and easy to improve through a repeatable local evaluation loop.
This is the current acceptance index; historical experiment reports are evidence,
not instructions or permanent product requirements.

| Requirement | Evidence | Status |
| --- | --- | --- |
| Repeatable local command | `pnpm run eval:kitchen --all`; isolated synthetic users, actual MCP HTTP client and local restricted Postgres writes | Verified on the pnpm dependency baseline |
| Versioned natural-language cases | Ten baseline, two fault, four observed validation, seven everyday cases in `evals/kitchen/scenarios.ts` | Latest: 22/23 accepted; 21 task passes, one expected safe failure, one inconsistent answer-judge flag |
| Effects independently checked | Initial/final SQL snapshots, expected state, duplicate prevention, stable identities, forbidden writes; 14 real MCP/database cases | Verified; not a guarantee for every possible retry history |
| Semantic outcomes and correlation | Command/tool/HTTP outcomes, safe logs, OTel traces and local Grafana collector; `docs/OBSERVABILITY.md` | Local evidence available; production collection not deployed |
| Answer correctness evaluated | Versioned grader, explicit false-success controls, 12 calibration examples, one user-adjudicated answer | Implemented; fallible model score, most labels remain agent-authored |
| Failures and recovery observable | Response-loss and persistent-service-failure cases; actual server result distinguished from model observation | Verified in the evaluation adapter, not ChatGPT |
| Reproducibility and spend | Model snapshot, source/catalog/instruction hashes, pnpm lock/config hash, usage and shared atomic ledger | Recorded; cumulative estimate $1.295346 of $5 |
| Comparable simplification experiment | `docs/audits/2026-09-06/kitchen-evaluation.md`: quantity uncertainty before/after | Recorded; existing schema columns reused |
| Automated validation | 250 unit tests, 181 integration tests, TypeScript and lint on reconciled pnpm branch; pre-push build | Local checks and exact-head CI pass at `de30fa6` |
| Real host/account linking | Updated `docs/mcp-golden-prompts.md`, including unknown/text/cleared quantities | Pending actual authenticated ChatGPT development check |
| Review and rollback | Draft PRs #192, #194, #198; reversible code changes, no migration/vendor change | Delivered for review; not merged or deployed |

Latest combined-run evidence:
[pnpm foundation verification](audits/2026-09-06/pnpm-foundation-verification.json).
Earlier recovery-instruction experiments were rejected. A subsequent user decision
now maps fully finished pantry items to removal; product guidance was updated for
that behavior. Seven new everyday cases all passed in the latest run. See
[everyday before](audits/2026-09-06/everyday-before.json) and
[everyday after](audits/2026-09-06/everyday-after.json).
The latter also preserves a judge verdict inconsistent with its approved rubric:
correct saved-state confirmation after recovery was labeled misleading. Judge
reliability needs work; this run is not reported as all passing.

## Remaining acceptance

Exact-head CI passed for `de30fa6` ([run 34064778220](https://github.com/tanayvenkata/meal-prep/actions/runs/34064778220)).
The candidate now runs against a separate local Supabase project,
`mise-host-acceptance`, on ports 553xx with one synthetic account and empty kitchen.
Public OAuth discovery, ES256 JWKS, password login, and unauthenticated MCP rejection
passed. See [host preflight evidence](audits/2026-09-06/host-preflight.json).

The user created **Mise Foundation Test** in ChatGPT. Its synthetic-account login
is still pending; the observed login page reports invalid credentials. The existing Mise connector still targets production.
Finish account linking and run the relevant golden prompts in a fresh development
conversation with candidate metadata. Record exact endpoint/commit and independent
before/after state. Preflight, Inspector, and API evaluations do not prove ChatGPT
host acceptance.

The temporary host environment is under `/tmp/mise-host-acceptance`; its private
runtime file contains synthetic credentials and must never be committed. It uses a
loopback routing proxy (8790), Next (3300), and the assigned ngrok origin. The proxy
exposes only the needed auth paths and rejects auth admin/Data API routes. Stop
ngrok and the proxy after host testing; stop only Supabase project
`mise-host-acceptance`, never the shared development stack.

## Deliberate limits

This foundation measures a small set of workflows, not universal model reliability.
Known delayed relative-write retry/ABA limitations remain documented in PROJECT.md;
immediate-retry tests do not establish durable idempotency for those operations.
Production telemetry retention and paid services remain separate decisions. No
evidence currently justifies switching database vendors or giving the model an
unrestricted pantry shell. Evaluate such alternatives against the same workflows
when a measured limitation motivates them.
