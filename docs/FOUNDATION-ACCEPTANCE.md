# Kitchen foundation: decision and verification

Reviewed 2026-09-06. The active goal ends at determining the tool interface and why,
with a repeatable local measurement loop. The user selected four tools. This is
not a declaration that every release requirement or future kitchen feature is done.

The current decision is [four composable kitchen tools](audits/2026-09-06/four-tool-decision.md).
Older roadmap/audit proposals remain historical evidence, not mandatory scope.

| Goal requirement | Authoritative evidence | Conclusion |
| --- | --- | --- |
| Repeatable local evaluation | `evals/kitchen/README.md`, fixture/run/scenarios code; current `four-tool-final-model-check.json` | Real MCP HTTP, synthetic users, owned local writes, independent SQL effects, versioned reports |
| Everyday intent and edge cases | 26-case baseline, 23-case paired non-fault comparison, five composition cases, per-turn equipment checks | Addition, unknown quantities, totals vs deltas, finished removal, proposals without writes, repeated purchases covered; not exhaustive |
| Truthful confirmation/recovery | Answer rubric/calibration artifacts; current lost-add-response model case | Add then reread successfully confirms saved state; grader flags remain fallible and visible |
| Semantic telemetry | `docs/OBSERVABILITY.md`, `telemetry-verification.json`, instrumented server/service | Command, tool, HTTP outcomes and traces distinguish transport success from applied writes; local collector only |
| Compare tool variations | `tool-surface-pair.json`, `tool-composition-pairs.json`, bias review | Four is capable and simpler; no proven universal latency/accuracy advantage |
| Four-tool depth | `kitchen-command-contract.ts`, `kitchen-commands.ts`, 19 focused schema/DB/HTTP checks | Optional pantry fields; mixed new/restock lists; atomic rollback and durable replay; ownership retained |
| Current model recheck | `four-tool-final-model-check.json`, commit `93c0597` | Five composition cases and lost-response case passed; regression checks, not fresh holdouts |
| Inspector and real host | `four-tool-host-check.json` | Inspector discovers four; refreshed ChatGPT connector passes four-turn add/restock/edit/remove/equipment workflow with SQL verification |
| Reviewable result | PR #208, linked #203/#191, decision record | Implementation/evidence pushed; four selected; no merge or deployment |

The previous baseline mayo failure remains in `chatgpt-host-verification.json`.
The fresh four-tool conversation used ChatGPT Chat/Instant; its underlying model
is not exposed. Do not attribute its improvement to tool count alone: descriptions,
contracts, server instructions, and conversation context changed as well.

## Rollout follow-through

The user subsequently requested switching to four tools. PR #208 integrates
current main's SDK v2, makes four the default, adds structured write outputs, and
wires persistent-dependency-failure injection. The final combined Luna run accepts
26/26 cases; the three-spice example saves 12 oz each in one add call. Local checks
pass: 271 unit tests and 197 integration tests, with a final focused modern-transport
failure check. See `four-tool-rollout-final.json` and the PR for source provenance.

The #209 storage prerequisite merged and its production migration succeeded before
the application switch. PR #208 / issue #203 track deployment and connector refresh;
this document does not substitute for their verified rollout status. Receipt-image
interpretation and production telemetry retention remain separate capabilities.
No vendor or paid-plan change is required. The former spending cap/ledger is retired.
