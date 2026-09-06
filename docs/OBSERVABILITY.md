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
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 npm run eval:kitchen:smoke
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

`npm run eval:kitchen:inspector` runs the official Inspector 2.5.0 CLI against
a private loopback fixture: initialization, discovery, descriptive add, and
quantity clearing. It uses no model/API credits. The first run downloads the
pinned Inspector package. Reports stay in ignored `.eval-results/kitchen/`.

For model scenarios, set the same OTLP endpoint when running `npm run eval:kitchen`.
Each recorded tool call includes a trace ID. Model calls still use the shared $5
budget ledger. Local traces and metrics cost no cloud fees; the optional Grafana
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

This is implemented on the draft branch. Local collector ingestion, metrics,
trace parentage, error paths, and Next's unauthenticated 401 path are verified.
Production deployment, production collector/retention choice, and actual ChatGPT
authenticated acceptance are still pending. See the
[verification evidence](audits/2026-09-06/telemetry-verification.json).

References: [OpenTelemetry exporters](https://opentelemetry.io/docs/languages/js/exporters/),
[manual instrumentation](https://opentelemetry.io/docs/languages/js/instrumentation/),
and [Grafana's local collector](https://grafana.com/docs/opentelemetry/docker-lgtm/).
