# Seeing what happened to a kitchen write

The application records two separate outcomes: `kitchen.command` describes the
service result; `mcp.tool` describes the response sent through the MCP SDK. An
`applied` command followed by `tool_error` can mean the write committed but its
response failed. Check the saved kitchen before retrying. HTTP 200 alone is not
a successful-write metric.

## Free local loop

Use Node 24 and the existing local Supabase stack. Start the optional viewer:

```sh
docker compose -f compose.observability.yml up -d
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 pnpm run eval:kitchen:smoke
```

Open [Grafana](http://127.0.0.1:3001). In Explore, select **Tempo**, choose a trace-ID
query, and paste a `traceId` from `.eval-results/kitchen/telemetry-smoke.json`.
The successful write links `eval.tool.call → mcp.tool → kitchen.command`.
Invalid tool input has no command span because validation rejected it first.

In Explore, select **Prometheus** and query:

```promql
mise_kitchen_operations_total{mise_layer="tool"}
```

This shows the latest per-process counters by operation and outcome. They are
not a permanent transaction ledger or a lifetime total. For a running process
with multiple samples, `rate(...[5m])` gives rates; a short smoke run exports one
sample, so a rate query may have no result. `mise_kitchen_duration_seconds` is a
duration histogram. `mise_mcp_requests_total` counts HTTP statuses, including
authentication failures, separately from semantic tool outcomes. Instance IDs
keep counters from different workers from being merged into one resetting stream.

`pnpm run eval:kitchen:inspector` runs the official Inspector 2.5.0 CLI against
a private loopback fixture: initialization, discovery, descriptive add, and
quantity clearing. It uses no model/API credits. The first run downloads the
pinned Inspector package. Reports stay in ignored `.eval-results/kitchen/`.

For model scenarios, set the same OTLP endpoint when running `pnpm run eval:kitchen`.
Each recorded tool call includes a trace ID. Model calls report per-run usage and estimated cost automatically; the user removed
the former cumulative cap and ledger requirement. Local traces and metrics cost no cloud fees; the optional Grafana
container uses local disk and memory. Stop it with:

```sh
docker compose -f compose.observability.yml down
```

The named volume preserves local telemetry. No Supabase or Vercel plan change is
needed. This Grafana image is for local development, not a production deployment.

## Outcome meanings and privacy

- `applied`: the service reports a change.
- `unchanged`: no change or an already-existing item.
- `replayed`: an earlier successful operation was replayed.
- `rejected`: conflict, missing target, unsupported quantity, or other domain rejection.
- `invalid_input`: service validation rejected input.
- `tool_error`: an MCP error result; inspect the linked command span to distinguish
  input validation from a command/serialization failure.
- `protocol_error`, `delivery_error`, `interrupted`, `exception`, `unclassified`:
  failed or unresolved processing. Do not interpret these as proof that no write occurred.

Structured logs carry `requestId`, `traceId`, `spanId`, operation, outcome, and
duration. HTTP logs carry status and request ID. Names, quantities, arguments,
results, user IDs, authorization headers, and exception messages are excluded.
Unknown tool names become `unknown_tool`. Traces use manual spans, not automatic
SQL or request-content instrumentation. Sensitive-value tests cover logs, spans,
and metrics. Synthetic evaluation reports deliberately contain fixture data;
do not run these fixtures against production or copy real kitchen data into them.

## Hosted behavior and remaining acceptance

Next initializes the SDK through `src/instrumentation.ts`; standalone MCP starts
the same provider. With no OTLP endpoint, structured logs and trace IDs work but
there is no network export. With an endpoint, Next's `after` hook flushes exporters
after the response so they have a chance to finish before serverless suspension.
Export timeouts are bounded; operational logging/export failures must not alter a
tool result. Telemetry remains best effort, so a missing span does not prove that
a request or write never happened.

## Production rollout (#22)

The installed app uses **Vercel**, while the Worker is a separate deployment.
Configure and verify both independently. The implementation supports authenticated
OTLP/HTTP JSON traces and metrics; console logs remain in platform logs (no Loki
log exporter). Prompts, tool arguments/results, identities, and exception messages
are not captured. This is operational telemetry, not conversation analytics.

### Plan and configuration

1. Use an existing collector, or create a Grafana Cloud Free stack. In Grafana's
   OpenTelemetry connection, obtain the **OTLP gateway base URL** and a scoped
   ingestion credential for metrics and traces. Confirm the account's current
   retention/ingestion limits before enabling exports; do not enable a paid plan
   implicitly. The token is write-only; dashboard access uses your Grafana login.
2. Save `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` in
   **Doppler meal-prep/prd** for the existing Vercel sync. For example, the base URL
   ends in `/otlp`, and headers have the form `Authorization=Basic%20<encoded-value>`.
   Keep actual values out of shell arguments, source, screenshots, and PRs.
   Verify the sync reached the production Vercel project before redeploying.
3. Stage the same settings in Worker secrets using the existing deployment
   workflow. `wrangler secret put` deploys immediately; use versioned secrets when
   staging. Deploy with `MISE_RELEASE` set to the full Git commit SHA. Worker
   `MISE_ENVIRONMENT` is production in the checked-in deployment config; override
   to development for local smoke tests. Do not change the installed connector URL.
4. Redeploy/restart each runtime after changing configuration. The SDK is initialized
   once per process/isolate. It exports manual spans only. Vercel uses `after`;
   Worker initialization happens after binding setup and `waitUntil` flush runs
   even when handling throws. Export requests time out after one second, with a
   1.5-second flush budget. Failed exports cannot reverse or fail a kitchen write.
5. Import `observability/mcp-dashboard.json` in Grafana and select the metrics
   datasource receiving this application's OTLP data. It shows per-tool outcomes,
   p95 durations, HTTP status rates, and command outcomes. No notification contact
   point or alert recipient is created by this change.

The base endpoint gets `/v1/traces` and `/v1/metrics` appended. Optional
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` / `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` are
complete URLs, used unchanged; their corresponding `_HEADERS` override matching
common headers. No endpoint disables network export. Invalid URLs disable that
signal. Removing **all common and signal-specific endpoints** and restarting is
also the rollback switch. Keep exporter debug logging off in production.

**Runtime finding:** Wrangler bundles OTel browser environment readers, which
ignore environment variables. The application therefore resolves URLs and passes
headers explicitly using the SDK's header parser. A Node-only test would miss
exports going to the default collector. `pnpm run test:telemetry-worker` verifies
actual workerd export to an authenticated ephemeral loopback collector, including
synthetic rejection/exception traces and payload exclusion. It needs no database
or cloud credentials. Its fixture entry point must never be deployed.

### Production acceptance (required before closing #22)

- Record the serving commit, deployment, runtime, timestamp, and backend stack.
  A merge or local collector success is not evidence of production ingestion.
- Make a fresh authenticated `read_kitchen` through the installed app. Find the
  `mcp.tool` trace in Tempo and its `kitchen.command` child. Match the server-owned
  `mise.request_id` on the tool span to the platform `requestId` log.
- Using an isolated test account, call a write tool with an empty batch so its
  schema rejects it before database execution. Confirm `tool_error` appears.
  To test a domain rejection, use isolated synthetic inventory and a deliberately
  stale expectation; verify `rejected`, with no actual write. Never mutate the
  real pantry to manufacture an incident.
- Verify unexpected exceptions and response delivery failures with local fixtures
  (`observability.test.ts`); do not add a public production failure-injection route.
  For production, either an isolated write rejection or a deliberately unauthenticated
  POST satisfies the synthetic-failure gate. Failed HTTP requests emit an error
  `mcp.request` span with a server-generated request ID, without reaching inventory.
- Confirm the dashboard sees outcomes/durations and the caller receives responses
  without waiting for collector availability. Check both Vercel and Worker if both
  are enabled. Inspect exported attributes for absence of sensitive data.
- Save sanitized evidence (IDs, revisions, outcomes, timings only). Leave #22 open
  until remote production ingestion and correlation have been observed.

Tempo TraceQL examples (select your Tempo datasource in Explore):

```traceql
{ resource.service.name = "mise-kitchen" && span.mise.outcome = "rejected" }
{ resource.service.name = "mise-kitchen" && span.mise.request_id = "<server-request-uuid>" }
{ resource.service.name = "mise-kitchen" && resource.mise.runtime = "vercel" }
```

Span resources distinguish `mise.runtime` (`vercel`, `cloudflare-workers`, `node`),
`deployment.environment.name`, and `service.version`. Metric resource promotion
is collector-dependent: choose the matching datasource/filtering policy when
combining local and production data. Request IDs are never metric labels. Rate
panels need multiple observations of a counter; short-lived serverless instances
may be underrepresented. Use traces to inspect individual calls; these metrics
are not a complete audit ledger. Spans are best effort and may be sampled/dropped.

### Verification status — 2026-09-07

Grafana Cloud stack `bronzecider1112` (1821415) is provisioned. Its stack-scoped
`mise-production-telemetry` access policy allows only metrics and traces ingestion.
OTLP settings are stored in Doppler `meal-prep/prd` and synced to Vercel production;
the separate Worker has the same settings in Worker secrets.

[Production dashboard](https://bronzecider1112.grafana.net/d/mise-mcp-operations/mise-mcp-operations)
is provisioned from this repository. The automation service account
`mise-observability-automation` has the Admin role, as requested by the owner.
Its token is stored separately in Doppler `mise-observability/prd` and is never
synced to the application. Both ingestion and automation tokens currently have
no expiry; rotate them in Grafana and update their corresponding Doppler config.
For the ingestion token, resync Worker secrets and redeploy both runtimes.

### CLI administration

From the repository, with the existing authenticated Doppler CLI:

```sh
doppler run -p mise-observability -c prd -- node scripts/grafana.mjs status
doppler run -p mise-observability -c prd -- node scripts/grafana.mjs dashboard
doppler run -p mise-observability -c prd -- node scripts/grafana.mjs metrics
doppler run -p mise-observability -c prd -- node scripts/grafana.mjs traces
doppler run -p mise-observability -c prd -- node scripts/grafana.mjs trace <trace-id>
```

`dashboard` idempotently updates the saved dashboard. `metrics` accepts PromQL;
`traces` accepts TraceQL. These commands load credentials directly from Doppler,
without pasting tokens into chat or shell arguments. Dashboard edits should be
made in `observability/mcp-dashboard.json` and synchronized with the command.

**Vercel provider finding:** hosting instrumentation can register the global
OpenTelemetry provider first. Mise retains its own tracer and meter and shares
its SDK state across Next bundles, so platform instrumentation cannot divert
manual spans away from the configured Grafana exporter. The HTTP exporter test
also pre-registers unrelated global providers to cover this production failure.
Manual Mise spans are always sampled, including when the caller or hosting
platform supplies an unsampled parent. This preserves the parent trace ID without
letting client sampling flags silence our operational telemetry. A processor
allowlist exports only `mise.kitchen` and local `mise.eval` instrumentation, even
when Next uses the same global provider. Failed HTTP requests also emit a manual
`mcp.request` error span, carrying status and request ID only.

References: [OpenTelemetry exporters](https://opentelemetry.io/docs/languages/js/exporters/),
[manual instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/),
and [Grafana's local collector](https://grafana.com/docs/opentelemetry/docker-lgtm/).

Configuration references: [OTLP settings](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/),
[Grafana Cloud OTLP](https://grafana.com/docs/grafana-cloud/observe-and-act/send-data/otlp/send-data-otlp/),
and [Workers background lifetime](https://developers.cloudflare.com/workers/runtime-apis/context/).
