# Mise foundation audit — 2026-09-06

Status: completed assessment; recommendations and experiment designs, not a shipped rebuild.
Baseline: `c4debb64184d2d2e09c1c99de255a8b6fe43b0d5`.

The user reopened the product direction: build a useful cooking pantry and meal-prep
assistant, learn the foundations, and measure behavior before expanding features.
The existing stack, 12 tools, exact-quantity policies, website shape, and old roadmap
are candidates for revision. This audit does not turn its own proposals into permanent
requirements. Preserve data and access controls while comparing implementations.

## Judgment

Mise has a reasonably tested inventory backend, but lacks the feedback system needed
to establish whether an agent can reliably use it. Passing backend tests and HTTP 200
responses do not establish task success. The highest-value reset is to establish
observable commands, recovery semantics, and realistic evaluations, then choose the
tool surface empirically. A database or language rewrite is an experiment with a cost,
not a prerequisite for this reset.

Recommended starting position: retain TypeScript and Postgres while measuring;
reconsider the exposed contracts and quantity model; keep hosting replaceable; add
OpenTelemetry with one inexpensive backend; implement a repeatable model evaluation
runner against isolated state. Revisit this position when measured evidence contradicts it.

## Evidence and limits

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm run test:unit` | 208 passed, 14 files | Current deterministic unit and mocked protocol contracts pass |
| `npm run test:integration` | 167 passed, 15 files | Integration lane, including real local Postgres tests, passes; this lane also includes some non-DB tests |
| Real hosted-handler probe, injected auth/services | 11 cases; 12 descriptors; 53,755 serialized descriptor bytes | Current SDK/schema/error behavior, without production data or model inference |
| Hosted handler → real kitchen service → local Postgres | Add Mayo with no quantity, repeated add, read, exact set, rename, read all succeeded | The simple addition path works across the runtime boundary locally; auth was injected |
| Latest baseline GitHub CI | Successful [run](https://github.com/tanayvenkata/meal-prep/actions/runs/33566083659) | Checked-in Node 24 CI lane passes |
| Production public probes | Health 200; unauthenticated MCP POST 401 with discovery challenge | Reachability and initial auth challenge only |
| Vercel inspection | Production alias Ready; deployment created September 1 | Deployment exists; not proof of a particular user's linked host metadata |
| Seven-day Vercel log request | Returned zero records | No usable historical evidence was retrieved; not proof of zero failures |

Local audit runs used the shell's Node **26.8.1**, whereas `.nvmrc` and CI specify
**24**. Report these separately; local passing results are not a Node 24 certification.
No fresh authenticated ChatGPT conversation, production write, model-driven eval,
billing-account inspection, or production inventory export was performed.

Detailed synthetic probe outputs are in
[`audits/2026-09-06/mcp-contract-probe.json`](audits/2026-09-06/mcp-contract-probe.json)
and [`audits/2026-09-06/local-db-probe.json`](audits/2026-09-06/local-db-probe.json).
These are boundary probes, not measured user success rates. Local fixture rows and
their temporary user were removed after the real-database probe.

## Findings

### 1. The current measurement boundary misses the reported failure

`src/mcp/server.ts:1533` creates a request ID and logs HTTP method, status, and elapsed
time. It does not identify the MCP method, tool, schema version, domain outcome,
committed effect, or result-validation stage. Some auth exits do not emit the same
completion event. Standalone and hosted logging also differ.

In the synthetic transport probe, **all 11 cases returned HTTP 200**:

| Case | Actual tool-level result |
| --- | --- |
| `{name: "Mayo"}` | `created`; service called once |
| Exact `{amount: "1", unit: "jar"}` | `created`; service called once |
| Explicit unknown object, approximate text object, numeric amount, plural unit, null quantity reset | Input validation error; service not called |
| Equipment kind `utensil` | Input validation error; service not called |
| Injected missing-target outcome | `not_found`, without `isError: true` |
| Injected incompatible-unit outcome | `unit_mismatch`, without `isError: true` |
| Injected backend exception | `isError: true`; exception message reached the tool response |

HTTP 200 is not itself an MCP defect. It is the wrong business-success denominator.
Monitoring only thrown errors is also insufficient: expected rejections can make a
product unusable without any infrastructure exception.

The injected exception was caught by the SDK and returned as a tool error; the outer
HTTP catch did not produce a failure log. A wrapper only around service callbacks
would still miss SDK input validation before those callbacks. Instrument both the
protocol dispatch/result boundary and the command boundary.

**Priority: foundation blocker.** Replace issue #22's current `fill-in` framing with
semantic observability and recovery evidence. No board changes were made by this audit.

### 2. “It failed” may describe response delivery after a successful write

[PR #188](https://github.com/tanayvenkata/meal-prep/pull/188), merged September 1,
documents a real instance: Postgres timestamps arrived as JavaScript `Date` objects,
but MCP output validation expected strings. A write could commit and then appear to
fail. The fix serializes timestamps; current tests include that runtime shape.

The user's example, “I have mayo, please add,” succeeds locally without a quantity.
The old serialization bug is a plausible historical explanation, **not a diagnosis**
of that particular incident. Other candidates include stale host descriptors,
invented quantity fields, auth expiry, or a database/hosting error. Current evidence
cannot rank their production frequency.

The remaining general problem is an uncertain outcome after a committed effect.
Receipt imports have durable user-scoped idempotency records. Relative single/batch
adjustments rely on expected quantities; the runbook explicitly documents their ABA
limitation: state can change away and back, making an old request applicable again.
Creates deduplicate names, which is not the same as identifying a particular purchase.

**Recommendation:** a durable command ID, request fingerprint, terminal result, and
operation-status read for retryable mutations. Commit the receipt and effect in the
same transaction. Validate public result projections before commit where practical;
retain status recovery because no database transaction can guarantee network delivery.
An HTTP trace ID, JSON-RPC ID, command ID, and evaluation-case ID serve different jobs.

### 3. Quantity restrictions are product decisions disguised as validation

The domain model already supports unknown, text, and structured quantities in
`src/lib/pantry-quantity.ts`. MCP add/update accepts only optional structured quantity;
omission supports unknown on creation, but there is no equivalent explicit reset or
approximate update. `turnover` measures replacement frequency, not stock level.

Keep Zod. It is useful for identity boundaries, payload limits, and safe execution.
Change what the schema models:

- Distinguish presence, availability (`in_stock`, `low`, `out`), an estimate, and an
  exact measured quantity. These are proposed concepts, not all required fields.
- Keep exact arithmetic restricted to exact compatible units. Do not make “half a
  jar” an exact volume or silently infer the capacity of a package.
- Normalize unambiguous spellings/aliases in one boundary. If accepting numeric
  amounts as well as decimal strings, validate precision before canonicalization.
  The narrower existing representation is defensible; ergonomic benefit needs a test.
- For writes, resolve a known resource or return candidates. Permit suggestions for
  “mayo” versus “mayonnaise”; never silently merge distinct items just to avoid a question.
- Avoid mandatory equipment categories that cannot represent a spatula or thermometer.
- Give each record a concurrency version and, if useful, a user-confirmed observation
  time. A current display name is not a complete state version.

The service currently returns internal records close to driver types. `db.ts` types
timestamps as strings even though the serialization fix had to handle `Date` values.
Normalize the driver boundary or explicitly model driver types; produce one consistent,
versioned public DTO instead of rediscovering runtime differences in each transport.

### 4. Coverage is strong within layers and weak at the product seams

Protocol tests inject service implementations. Database tests test the real service
and SQL. That separation is useful for localization, but the old timestamp failure
shows why a few real **MCP → service → database → serialized result** tests are also
necessary. The local Mayo probe exercises this seam; it should become a maintained
fixture-based regression test in the foundation implementation.

`docs/mcp-golden-prompts.md` is a manual runbook, not an automated model evaluation.
Its direct/empty/mobile cases still reference a removed widget. There is no checked-in
model runner, versioned task dataset, judge calibration, or automated task scorecard.

The test policy “each layer mocks everything below” should be guidance for most unit
tests, not a prohibition against a small number of cross-layer tests.

### 5. Tool count is a hypothesis; schema weight and semantic overlap are measurable

The wire catalog has 12 tools and 53,755 JSON bytes. This is **not** a measured token
count or proof that ChatGPT places the entire catalog in every prompt. Output schemas
alone for consume, restock, batch, and receipts total 25,375 bytes. Much of the size
comes from repeated outcome structures.

Overlaps: update versus exact-set; individual consume/restock versus batch adjustment.
Asymmetries: stable IDs for lifecycle changes versus normalized names for adjustments;
public result shapes vary between a top-level status and an `outcome` wrapper.
None proves that fewer tools will perform better. They justify a controlled comparison.

OpenAI recommends coherent user actions, explicit contracts, clear selection descriptions,
and separation where permissions or consequences differ.
[Official guidance](https://developers.openai.com/apps-sdk/plan/tools/)

## What a good agentic foundation means here

| Foundation | Concrete Mise requirement |
| --- | --- |
| Defined tasks and success criteria | Add an unspecified item, reconcile a shelf, cook a meal, update leftovers; expected final state and allowed clarification |
| Useful context | Honest quantity uncertainty, stable identity, equipment capabilities, freshness; bounded reads as inventories grow |
| Composable capabilities | Commands that do meaningful work, rather than forcing the model to coordinate every database field |
| Reliable effects and recovery | Atomicity where intended, idempotency, version checks, operation receipts, corrections/undo |
| Observable execution | Correlated dispatch, validation, auth, command, persistence, projection, and response outcomes |
| Repeatable evaluations | Realistic prompts, seeded kitchens, deterministic state graders, limited human/LLM grading of advice |
| Controlled delivery | Schema versions, reproducible runtime, isolated test data, deployment checks, rollback and restore rehearsal |
| Cost and learning feedback | Track what each component buys, monthly spend, debugging time, and the transferable concept learned |

OpenTelemetry supplies instrumentation and export for signals; it is not a dashboard,
an eval suite, or an inventory audit ledger. Logs describe events, traces connect work
within a request, and metrics aggregate outcomes. Command receipts preserve effects
even when telemetry is sampled, dropped, or expired.
[Signals](https://opentelemetry.io/docs/concepts/signals/)

## Observability proposal

Use one instrumentation layer shared by website and MCP commands, with OTel spans
and metrics exported over OTLP to one backend. Start with Grafana Cloud Free as the
candidate for backend observability. Keep structured JSON logs with trace correlation;
the JS docs currently mark traces and metrics stable and logs in development.
[JS status](https://opentelemetry.io/docs/languages/js/)

Do not install Grafana, Sentry, Langfuse, and a self-hosted collector stack all at once.
Langfuse becomes a useful alternative/addition when we own model runs and want its
dataset/evaluation workflow. It cannot reveal hidden ChatGPT activity by being attached
to our MCP endpoint.

Proposed span tree:

```text
mcp.request
  auth.verify
  mcp.dispatch / input.validate
  kitchen.command
    db.transaction
    command.receipt
  result.project / result.validate
  response.prepare
```

Record bounded attributes: environment, deployment SHA, protocol version, tool-contract
version, transport, tool name, command kind, outcome category, error code, number of
changes, response bytes, and elapsed time. Use trace/request/command IDs for correlation
in traces or logs, not as metric labels. Do not log raw arguments, receipts, tokens,
JWTs, SQL parameters, kitchen contents, or user IDs. Add an explicit redacted diagnostic
path later if investigating user input requires it; no blanket payload capture.

Outcome vocabulary should separate `applied`, `unchanged`, `replayed`, `needs_input`,
`not_found`, `conflict`, `invalid_input`, `unauthorized`, `dependency_failure`, and
`output_failure`. Preserve more specific domain codes beneath these bounded categories.
An expected conflict can be a correctly functioning safeguard and still a product-friction
event. Record both dimensions.

| First dashboard measure | Definition / interpretation |
| --- | --- |
| Calls by tool and semantic outcome | Count dispatches, including validation failures before service entry |
| Write application and rejection rates | Separate write attempts from reads; show counts as well as percentages |
| Unexpected failure rate | Dependency/uncaught/output failures divided by received applicable calls |
| Duration distributions | Tool, auth, and DB duration; separate cold starts where observable |
| Recovery | Same command ID replay/status result; uncertain commit followed by recovery |
| Contract friction | Quantity/unit/target/category validation and rejection codes |
| Telemetry delivery | Export errors and bounded flush failures; synthetic error must appear remotely |
| Evaluation results | Final-state success, unsupported requests handled honestly, excess clarification, false success claims |

For personal traffic, retain all small semantic events initially with bounded retention
and volume. Do not promise error-complete sampling through a sampler that decides
before the error happens. Add sampling only with a tested error-retention strategy.

The installed Next 16.3.4 docs provide `src/instrumentation.ts` and `register()`, with
runtime-specific imports. Use the supported serverless export lifecycle and verify
delivery after a short invocation; relying on a long periodic timer can lose telemetry.
Initialize standalone tracing before instrumented imports. Treat process-local metrics
as exportable deltas/aggregations, not a durable global counter. Bound flush time and
make exporter outages unable to fail kitchen mutations.
[Vercel instrumentation](https://vercel.com/docs/tracing/instrumentation),
[OTel serverless](https://opentelemetry.io/docs/languages/js/serverless/)

**Critical visibility limit:** Mise sees calls that reach it, not all prompts, skipped
calls, hidden model reasoning, or the final ChatGPT reply. It cannot compute real
ChatGPT task-success rate from server metrics alone. Use controlled host checks for
that surface and an owned evaluation runner for complete prompt → tool → state → answer
traces. Mark host/model information unknown if not supplied; don't infer sessions from
timestamps. In an owned runner, attach explicit run/case IDs and record actual usage.

## Evaluation design

Build four distinct layers. A passing lower layer cannot substitute for the next one.

1. Deterministic command tests: invariants, authorization, unknown/estimated quantities,
   concurrent edits, retries, undo conflicts, batch rollback.
2. Wire and real-database tests: both transports, actual driver types, SDK validation,
   response shape, malformed input, committed-but-undelivered response recovery.
3. Model-driven scenarios: a small owned runner gives the model the exact exported
   tool catalog, executes against isolated kitchens, and grades final state and answer.
   This is a test client, not a new production chat product.
4. ChatGPT host acceptance: fresh/long conversations, refreshed/stale descriptors,
   account linking, actual tool selection, receipt review, and truthful final narration.
   This remains a small controlled host suite because the API runner is a surrogate.

Start with roughly 40 reviewed scenarios, including ordinary typos and short speech-like
requests. Include the user's Mayo request verbatim. Seed 20-, 100-, and 500-item kitchens
for size tests; record these as synthetic sizes, not current usage. Suggested cases:

| Scenario | Grade |
| --- | --- |
| “i hacve mayo pls add” | One owned item with unknown quantity; no invented amount; correct final statement |
| “Actually it is half a jar” | Explicit estimate persisted or limitation stated; no fabricated volume |
| Repeat after a lost response | One intended effect; recovered original status |
| “Add mayo” with Mayonnaise present | Explain/resolve identity; don't silently create a semantic duplicate or restock |
| “Bought another jar” | Restock/purchase intent distinguished from recording presence |
| “I have a spatula and a thermometer” | Equipment can be represented without a false category |
| “We are out of cumin” | Availability updated without requiring invented exact consumption |
| “Plan lunches using two eggs” | Useful advice; zero inventory mutation |
| “Cooked it; used two eggs” | Authorized exact adjustment; no inferred other consumption |
| “Used a little oil and two eggs” | Preserve uncertainty; exact line not forced into an unsafe all-or-nothing guess |
| “Make four lunches with one skillet” | Feasible sequence and portions; no invented equipment |
| “Save that plan for tomorrow” | Durable recall if supported, honest limitation otherwise |
| Database unavailable / stale version / expired auth | Truthful recoverable outcome; no claim of success |
| Receipt containing instruction-like text | Treat content as data; only authorized reviewed effects |
| Another user's ID | No data disclosure or mutation |
| Response serialization fails after write | Recover committed result; no duplicate effect |

Grading priority: exact database state and forbidden-effects checks first. Use a human
rubric for cooking usefulness, then calibrate any model judge against those labels.
Allow multiple valid tool paths; don't hard-code the current tool sequence as success.
Keep a held-out set, preserve failures, and use pairwise review for advice quality.
[OpenAI eval guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices)

Comparison plan: same fixtures, prompts, user-reply scripts, model settings, and time
budget for each surface; three repetitions per case initially; retain per-case outcomes
and denominators. A 40 × 3 × 2 comparison is 240 scenario runs, not 240 model calls.
Multi-turn runs cost more. Calibrate cost on 10 runs, then set a hard run/token/spend
cap before scaling. No model API spending was initiated during this audit.

Proposed release gates, to adopt after baseline calibration: zero forbidden mutations
and duplicate effects in deterministic suites; no known false-success narration in
critical cases; at least 95% final-state success on the defined supported-task suite;
new design beats or matches the baseline on held-out cases without materially increasing
clarification or latency. These are targets, not a statistically established reliability
claim. Report sample counts and uncertainty; a small 100% pass set does not prove safety.

## CRUD, kitchen commands, or “pantry bash”?

Separate the domain capability layer from its model-facing syntax. Build commands that
can be called by MCP, a website, a test harness, or a future sandbox. This makes the
comparison cheap and keeps transaction rules out of the model.

| Candidate | Advantage | Cost / question |
| --- | --- | --- |
| A: current 12 tools, improved descriptions/results | Smallest change; known host integration | Overlapping operations, duplicated schema, single-item coordination |
| B: small set of composable commands | One request can reconcile several facts; consistent preview/apply/recovery | Union schemas and generic descriptions can also confuse models |
| C: sandboxed code calling kitchen capabilities | Loops, filtering, dependent operations, reusable scripts | Sandbox, execution limits, approval attribution, replay and partial-effect handling |
| Raw SQL or operating-system shell | Maximum low-level freedom | Exposes implementation and broad authority; defeats domain guarantees; not a suitable default |

Candidate B experiment: `get_kitchen_context`, `record_kitchen_changes` for a bounded
list of explicit observations/edits/additions, `adjust_inventory` for exact relative
changes, a separate removal command, and `get_operation_status`. A preview mode or
separate proposal command can serve uncertain multi-item work. This is a sketch to
evaluate, not a commitment to five tools or one giant discriminated union.

Simple clear additions should execute directly within their authorized scope. Reserve
review for ambiguous identity/quantities, bulk reconciliation, and consequential changes.
Never make every “add mayo” require preview → confirm → apply as an architectural tax.
MCP annotations and “confirmed” arguments alone do not prove user consent. If server-
verifiable review is required, bind an authenticated UI approval to a stored proposal
and its exact hash/version; otherwise evaluate host confirmation behavior explicitly.

A proposal can report valid and unresolved lines without writing anything. The user can
choose a subset; apply that accepted subset atomically. Don't make a 20-line pantry
reconciliation unusable because one package size is unknown.

Code mode is worth a bounded learning experiment after the command layer. Cloudflare's
docs identify composed calls, large catalogs, and control flow as its strengths, while
direct tools suit small fixed tasks. Current Code Mode is documented as experimental.
[Code Mode](https://developers.cloudflare.com/agents/tools/codemode/),
[MCP patterns](https://developers.cloudflare.com/agents/model-context-protocol/codemode/)

If tested, expose only user-scoped capabilities to an isolated execution environment;
no database credentials, filesystem, or arbitrary network. Bound execution time, calls,
output, and write count. A loop must not turn an atomic command into many partially
committed writes. Do not use `eval` or Node `vm` as the isolation boundary. Compare
common simple tasks as well as large batches so a spectacular bulk demo cannot hide
a worse “add mayo” experience.

## Stack and data decisions

| Layer | Assessment and recommended experiment |
| --- | --- |
| TypeScript / Node | Retain as starting point. Shared server/UI types, installed SDKs and test tooling fit. Python would not fix schemas or observability; choose it only for a specific learning goal or substantial Python-only workload. Enforce Node 24 in the dev bootstrap. |
| Zod | Retain, redesign domain choices and error ergonomics. Derive repeated public shapes from shared definitions; measure serialized schemas. Don't replace correctness with permissive arbitrary JSON. |
| Next / Vercel | Reasonable consolidated host for MCP, OAuth and controls. Candidate lean alternative: one Node HTTP app serving MCP and small web controls. Compare cold/warm latency, auth round trips, operational burden and total cost before moving. |
| Supabase / Postgres | Strong default because it supplies database, identity, and the currently integrated OAuth server. The migration cost includes auth.users foreign keys, policies/functions, consent flow, and token discovery—not just copying rows. |
| Neon / Postgres | Worth a spike if idle cost, branching, or scale-to-zero is the real driver. Neon Auth availability does not by itself prove drop-in compatibility with Supabase's MCP authorization-server/consent contract. Prove account linking before any migration recommendation. |
| SQLite / D1 or a small persistent Node deployment | Viable kitchen-scale storage candidates. D1 requires rewriting Postgres-specific SQL/RLS/transactions and replacing the auth integration. A local SQLite file also needs durable hosting and backups; an ephemeral serverless filesystem is not durable storage. |
| Raw SQL / ORM | Existing SQL can remain while we learn the behavior. An ORM can reduce repetitive mapping, but does not remove transactions, authorization, or migration design. A small repository module is enough; don't add an abstraction for every table. |
| Widget / website | No live widget exists. Keep direct correction available. Prototype a reconciliation table only if it reduces uncertainty/clarifications in evals. Website and widget should consume the same commands, not duplicate kitchen rules. |
| Owned AI runtime | Build an eval client first. Add a production harness only when controlling the complete conversational experience, background work, or explicit product telemetry justifies its API cost and maintenance. |

Supabase's current documentation confirms that its Auth service can act as the OAuth
authorization server for MCP clients; this is a meaningful integration to include in
any replacement proof. [OAuth server](https://supabase.com/docs/guides/auth/oauth-server)

The current source concentration—1,756 lines in `server.ts`, 1,102 in the service,
1,486 in `db.ts`—makes unrelated concerns harder to inspect. Split by responsibility
as the command layer is introduced: transport/auth, tool contracts/adapters, domain
commands, repository/driver mapping, and observability. Avoid microservices.

Deployment sequencing also deserves a foundation check: Vercel auto-deploys app code,
while the GitHub workflow pushes migrations after CI. No cross-system ordering gate
is established by that workflow alone. Use backward-compatible expand/contract schema
changes or an explicit deployment sequence; a successful build is not proof that the
target database has the expected schema. This is a code/config observation, not a
confirmed deployment incident.

The existing inventory grain is one canonical name per user. It cannot distinguish two
lots of chicken with different storage locations or dates. Do not immediately introduce
an ingredient ontology, but test the needed grain: an item definition plus optional
stock lots, user observations, and later prepared batches. Store freshness/availability
as supplied facts; do not infer food safety from an inventory timestamp. Keep preferences
explicit, distinguish observed facts from derived advice, and provide correction/export.

For learning, the sequence teaches: measurement → protocol boundaries → state and
idempotency → agent evaluation → deployment tradeoffs. Swapping vendors first teaches
a migration while leaving the actual failure unexplained.

## Costs and what they buy

Prices checked September 6, 2026. These are public list prices and illustrative budgets,
not the user's current bill. Existing account tiers, credits, storage, egress and tax
were not inspected. No purchases or account configuration changes are proposed here.

| Component | Range or verified starting point | Value / tradeoff |
| --- | --- | --- |
| Database and auth | Supabase Free $0; Pro starts $25/month | Free includes 500 MB but pauses after a week inactive and has no automatic backups. Pro adds a more suitable always-available baseline and daily backups; additional projects/usage can cost extra. |
| Alternative Postgres | Neon Free $0; Launch usage-based, no monthly minimum | Current pricing lists $0.106/CU-hour and $0.35/GB-month. Suspended compute is unbilled. Auth migration effort must be costed separately. |
| Alternative database | D1 free allowance: 5M rows read/day, 100k written/day, 5 GB total | Worker execution, auth and migration are separate concerns; cheap database capacity is not the whole stack. |
| App hosting | Vercel Hobby $0 within its terms/limits; Pro starts $20/month plus usage | Buys execution and deployment. Paid hosting does not automatically improve tool design. |
| Observability | Grafana Cloud Free $0; Pro starts $19/month plus usage | Free offers 14-day retention, 10k metric series, 50 GB each of logs/traces monthly. Enough headroom for a small initial implementation if cardinality stays bounded. |
| Model-run observability | Langfuse Hobby $0, 50k units/month, 30-day access | Useful for owned model experiments; units are not necessarily whole runs. Additional integration is optional. |
| Model evaluations | Proposed initial cap $5–15/month, after a 10-run cost calibration | Pays for repeatable tool-selection and task-quality experiments. This is a spending proposal, not an estimate from observed token use. |
| Other | Optional domain, transactional email, export storage, backups, existing secret-management/tunnel plans | Inventory actual bills before adding services. Receipts need not be stored as images merely to apply reviewed changes. |

Sources: [Supabase](https://supabase.com/pricing), [Neon](https://neon.com/pricing),
[D1](https://developers.cloudflare.com/d1/platform/pricing/),
[Vercel](https://vercel.com/pricing), [Grafana](https://grafana.com/pricing/),
[Langfuse](https://langfuse.com/pricing).

Illustrative choices, excluding the existing ChatGPT subscription, tax and optional services:

- **$0 infrastructure, plus a capped eval budget:** free hosting/DB/monitoring; accept
  free-tier limitations and arrange verified exports/restores. Not an always-on promise.
- **About $30–40/month:** Supabase Pro $25 + free hosting/monitoring + $5–15 eval cap.
  A sensible reliability/learning starting budget if those limits fit actual usage.
- **About $50–60/month:** the preceding option plus $20 hosting. Spend this only if
  hosting requirements warrant it. More spending does not automatically improve accuracy.

Mise's current production tool path does not call a model API. ChatGPT supplies the
conversation. An owned eval runner or future custom chat introduces separate metered
model costs. Track model tokens/usage in that runner; the MCP server cannot infer the
user's ChatGPT bill or hidden inference usage from response bytes.

Before choosing a database, compare monthly cash plus migration and maintenance hours.
Free-tier inactivity is a candidate operational issue to check against the actual plan,
not a proven cause of the Mayo failure.

## Documentation reset

Historical documents currently contain incompatible expectations: old chat screens and
widgets, stale provider/Redis references, mandatory layer isolation, and preserved tool
counts in migration plans. Future agents should not mistake these for product requirements.

Recommended homes:

- `AGENTS.md`: short routing, learning style, data safety, validation expectations.
- `docs/PROJECT.md`: concise present facts and currently accepted objectives, with dates.
- Decision records: alternatives, evidence, chosen tradeoff, and a revisit trigger.
- Evaluation dataset/runbook: executable acceptance criteria, not a second prose roadmap.
- GitHub board: implementation tasks after decisions; archive or reframe obsolete cards.
- Historical design/learning material: explicitly historical; load only when relevant.

This audit replaces the active project brief with concise current orientation, archives
the previous brief, labels older references, and fixes obsolete widget expectations in
the host runbook. It does not silently accept every proposal. The detailed MCP guide
remains canonical for operating the current
implementation. Its current contracts are migration baselines, not permanent prohibitions
on redesign. Authentication, ownership and preservation of user data remain requirements.

## Ordered foundation program

These are proposed work packages for review, not independently scheduled backlog entries.

| Order | Work | Exit evidence | Learning outcome |
| --- | --- | --- | --- |
| 0 | Reset documentation authority; preserve baseline and existing data | Current objective is visible; old roadmaps labeled; export/restore method identified before destructive work | Decisions versus historical implementation |
| 1 | Semantic instrumentation and minimal dashboard; real wire/DB regression slice | A forced input error, domain rejection, backend failure and response failure are separately visible and traceable; telemetry flush is tested | Traces, metrics, error taxonomy and runtime seams |
| 2 | Versioned scenario set and repeatable evaluation runner | Baseline scorecard, run artifacts, calibrated cost, held-out cases; small actual-host acceptance set | How to measure agent behavior |
| 3 | Retry/recovery command core plus tool-surface experiment | Current tools versus composed commands on identical cases; known outcome after lost responses; no duplicates | Transactions, idempotency, design of agent capabilities |
| 4 | Adopt winning quantity/identity and interaction changes | Mayo, estimates, low-stock, tools and multi-item correction succeed with low friction | Domain modeling around real use |
| 5 | Stack decision using measured workload and total cost | Keep/migrate decision with auth proof, latency/cost evidence, export/restore and rollback plan | Database/hosting tradeoffs |
| 6 | First durable cooking/meal-prep slice | Saved plan or prepared batch is recalled accurately next session; inventory changes require actual use intent | Workflow state and useful memory |
| Later | Taste history, recipe reuse, shopping, summaries and playful features | Each has scenarios and a value/effort case | Product iteration on trustworthy foundations |

If a critical auth or data-loss defect is discovered, fix it immediately rather than
waiting for the sequence. Otherwise freeze new feature expansion through the measurement
baseline. Issue #22 should lead; #13 should emphasize useful cooking memory; #31 and
visual-only cards should wait. #179 should start with host compatibility evidence and
must not preserve “all 12 tool names” as an immutable product constraint.

First concrete milestone: **a failed “add mayo” produces enough evidence to distinguish
no call, rejected input, failed persistence, committed-but-undelivered result, or incorrect
host narration—and the same scenario is repeatable without relying on the user to probe.**
“No call” and host narration require the controlled host/eval layer; server traces alone
cannot establish them.
