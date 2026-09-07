# Capability and documentation audit — 2026-09-07

Snapshot of `main` at `bdc2b2b1b1e03723b35c7374373ad47e58f06c9a`, matched to GitHub
main during review. This is dated evidence, not another backlog. GitHub Issues
own remaining work; PROJECT owns accepted direction; README owns setup.

## What runs

| Capability | Source and observed evidence | Limit |
| --- | --- | --- |
| Pantry/spice/equipment reads and writes | `src/mcp/server.ts` → `src/lib/kitchen-service.ts`, `kitchen-commands.ts` → `db.ts`; default four tools | Each write list is atomic, not an entire multi-call conversation; no unit conversion or full replacement transaction |
| Safe retries and stale-state rejection | Command contracts, operation receipts, protocol/service tests | Fresh state and correct request IDs still matter; historical replay is not current inventory |
| Account, login, consent, pantry/tools website | Routes under `src/app/account`, `login`, `oauth`, `pantry`, `tools`; API/component tests | Grant status is not live connector health; desktop design #247 is a design artifact |
| Production MCP and telemetry | `MCP-DEPLOYMENT.md`, `OBSERVABILITY.md`, sanitized production evidence | Installed endpoint is Vercel; Worker is separate. Existing evidence, not a fresh authenticated production test in this audit |
| Recipe suggestions and image interpretation | Host ChatGPT uses inventory tool results and conversational instructions | No Mise recipe engine, OCR service, appliance calibration algorithm, or image-input evaluation in the runner |
| Local evaluation | `evals/kitchen/run.ts`, `scenarios.ts`, fixture and grading code | Text scenarios; explicit four-tool selection required; not a substitute for mobile or multimodal host acceptance |
| Saved-inventory card | PR #246 closed without merging; closing comment shelves passive UI | No card registration/build dependency in tracked main. Pre-existing untracked `src/mcp/inventory-ui/` files excluded from this audit's changes |
| Dish log / Cooking Wrapped | No `cook_events` migration, service, route, or MCP registration in tracked main | Not implemented; #13 then #31 |
| Native website chat | Removed in #184; `db.ts` conversation/message helpers referenced only by tests | Legacy data remains; no production chat caller. Do not drop tables/migrations without retention/export decision |

## Which prompts matter

1. **Server instructions:** `createMiseServer` supplies instructions through MCP
   initialization/discovery. They describe writes, retries, planning, and equipment.
   This is guidance to the host, not server-side execution or guaranteed obedience.
2. **Tool descriptions, schemas, results:** registered in the same server. These
   form the actual callable contract; runtime validation and command transactions
   enforce constraints that prose alone cannot.
3. **Five MCP templates:** `registerMisePrompts` exposes `plan_meal`, `quick_bite`,
   `cook_something_cool`, `pantry_audit`, and `substitutions`. `prompts/get` returns
   user-message text; it does not execute a read or install global instructions.
   Protocol tests cover listing/getting them on both transports. Visible starters
   or host invocation remain unverified (#224). Keep pending that host check.
4. **Evaluation prompts:** scenarios and the answer-grader rubric run only in the
   local evaluation harness. The actor receives MCP instructions/tool schemas,
   but the runner does not fetch the registered prompt templates. Default surface
   is baseline; use `MISE_TOOL_SURFACE=four pnpm run eval:kitchen` for production parity.
5. **Historical persona/custom-GPT-era copy:** no tracked application loader reads
   Markdown/design handoffs or a custom-GPT system-prompt file. The old website
   chat route/model loop was deleted. Any instructions configured outside the
   repository in a custom GPT cannot be established by this source audit.

The latest equipment/preparation change (#251) changes instructions and template
text. It does not implement appliance-spec lookup or measured calibration.
Testing the returned prompt text does not establish better meal recommendations.
Official [MCP server guidance](https://developers.openai.com/plugins/build/mcp-server)
describes exposing tools to ChatGPT; actual host selection/use needs separate evidence.

## Open issues: remaining completion work

| Issue | Remaining work / recommendation |
| --- | --- |
| [#242 receipt review](https://github.com/tanayvenkata/meal-prep/issues/242) | Reconcile scope first: #246 is closed, not an active draft. Recommend closing the passive-card slice as shelved; keep receipt approval only if a concrete remaining problem justifies it. No receipt draft/approval/replacement implementation exists. Do not restart the card from the stale issue instructions. |
| [#224 mobile cooking](https://github.com/tanayvenkata/meal-prep/issues/224) | Run the user's phone capability matrix and one text → voice recipe walkthrough, with recovery/lock-screen/timer observations. Record actual prompt exposure and tool calls separately. The widget recommendation exists; phone acceptance is incomplete. |
| [#88 multimodal](https://github.com/tanayvenkata/meal-prep/issues/88) | Capture repeatable receipt and shelf-photo cases with input images, ambiguity handling, confirmed batch, fresh saved-state verification, and retry evidence using synthetic inventory. Positive user reports exist, but current text-only evals do not satisfy this. Dish-photo logging should follow #13 rather than block receipt acceptance. |
| [#13 dish log](https://github.com/tanayvenkata/meal-prep/issues/13) | Entire vertical slice remains: owned event schema, record/query commands, bounded history, isolation tests, and ChatGPT acceptance. Correct its Worker production claim. Start with a minimal cooked-meal record rather than all optional metadata. |
| [#31 Wrapped](https://github.com/tanayvenkata/meal-prep/issues/31) | Blocked by #13. Then bounded aggregate queries and a verified summary grounded in saved cook events. No need for another website chat. |

No open PRs at inspection. Issue states/bodies were not changed by this audit;
recommendations above do not claim completion of untested host workflows.

## Documentation disposition

- **Keep current:** README (setup/product boundary), PROJECT (direction),
  CONTRIBUTING (workflow), SECURITY, MCP AGENTS (protocol constraints), deployment,
  observability, schema, golden-prompt runbook, and evaluation README.
- **Replace obsolete prose:** `environments.md` now contains only current config
  boundaries; removed the Anthropic/Redis plan, obsolete test variable, and
  speculative vendor/pricing guidance. Earlier text remains in Git history.
- **Correct status:** PROJECT no longer calls evaluation/rollout unimplemented or
  production telemetry merely proposed. Cooking spike records #246 as shelved.
- **Label historical:** foundation acceptance is a dated decision snapshot, and
  design README explicitly says persona/chat screens are not runtime behavior.
  Keep the original audit, decision artifacts, and design sources as evidence;
  they are not active implementation requirements.
- **Potential later code cleanup:** remove unused conversation helper APIs/tests
  only as an intentional compatibility change; preserve data. The baseline tools
  still support comparisons, so they are not dead code. Retiring them needs an
  explicit evaluation/rollback decision, not a blanket legacy-file deletion.

## Validation and limits

Node 24.20.0: all 372 unit tests across 33 files passed, including MCP protocol,
services, API, components, auth/config helpers, and middleware. Current main's
[CI run](https://github.com/tanayvenkata/meal-prep/actions/runs/34150565962) also
reports success. No fresh database integration, paid model evaluation, phone
interaction, production mutation, or custom-GPT settings inspection was performed.
This cleanup changes documentation only; source/runtime behavior is unchanged.
