import { parseKeyPairsIntoRecord } from "@opentelemetry/core";
import { metrics, trace, type Tracer, type Meter } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { AlwaysOnSampler, BatchSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base";
import { MeterProvider, PeriodicExportingMetricReader, type PushMetricExporter } from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";

type Telemetry = { flush: () => Promise<void>; shutdown: () => Promise<void>; tracer: Tracer; meter: Meter };
// Next instrumentation and route bundles share a process, but not module state.
const state = globalThis as typeof globalThis & { __miseTelemetry?: Telemetry };
export const kitchenTracer = () => state.__miseTelemetry?.tracer ?? trace.getTracer("mise.kitchen", "1");
export const kitchenMeter = () => state.__miseTelemetry?.meter ?? metrics.getMeter("mise.kitchen", "1");

/** Wrangler selects browser OTel builds, whose environment readers are no-ops.
 * Resolve config explicitly in both runtimes; use the SDK's standard header parser.
 * Signal endpoints are complete URLs; the base endpoint gets a signal suffix.
 */
export function otlpOptions(signal: "TRACES" | "METRICS") {
  const specific = process.env[`OTEL_EXPORTER_OTLP_${signal}_ENDPOINT`];
  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!specific && !base) return undefined;
  const url = specific || `${base!.replace(/\/$/, "")}/v1/${signal.toLowerCase()}`;
  // Invalid settings disable that exporter rather than breaking application startup.
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return undefined;
  } catch { return undefined; }
  return {
    url,
    headers: {
      ...parseKeyPairsIntoRecord(process.env.OTEL_EXPORTER_OTLP_HEADERS),
      ...parseKeyPairsIntoRecord(process.env[`OTEL_EXPORTER_OTLP_${signal}_HEADERS`]),
    },
    timeoutMillis: 1000,
  };
}

/** Manual spans only: no SQL, HTTP headers, prompts, or kitchen data capture. */
export function startKitchenTelemetry(exporters: { traceExporter?: SpanExporter; metricExporter?: PushMetricExporter; release?: string; runtime?: "node" | "vercel" | "cloudflare-workers" } = {}): Telemetry {
  if (state.__miseTelemetry) return state.__miseTelemetry;
  const traces = otlpOptions("TRACES");
  const metricOptions = otlpOptions("METRICS");
  const traceExporter = exporters.traceExporter ?? (traces ? new OTLPTraceExporter(traces) : undefined);
  const metricExporter = exporters.metricExporter ?? (metricOptions ? new OTLPMetricExporter(metricOptions) : undefined);
  // Distinct process identities prevent counters from different workers from
  // being mistaken for one stream that repeatedly resets.
  const proposedRelease = exporters.release ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.MISE_RELEASE ?? "";
  const release = /^[a-f0-9]{40,64}$/.test(proposedRelease) ? proposedRelease : "development";
  const runtime = exporters.runtime ?? (process.env.VERCEL ? "vercel" : "node");
  const environment = ["production", "preview", "development"].includes(process.env.VERCEL_ENV ?? process.env.MISE_ENVIRONMENT ?? "")
    ? (process.env.VERCEL_ENV ?? process.env.MISE_ENVIRONMENT)! : "development";
  const resource = resourceFromAttributes({ "service.name": "mise-kitchen", "service.version": release, "service.instance.id": randomUUID(), "mise.runtime": runtime, "deployment.environment.name": environment });
  const batch = traceExporter ? new BatchSpanProcessor(traceExporter, { scheduledDelayMillis: 1000, exportTimeoutMillis: 1500 }) : undefined;
  const tracerProvider = new NodeTracerProvider({ resource, sampler: new AlwaysOnSampler(), spanProcessors: batch ? [{
    onStart: (span, parent) => batch.onStart(span, parent),
    onEnd: span => {
      // When we own the global provider, Next can use it too. Export only our
      // manual instrumentation, never framework HTTP/SQL/content spans.
      if (["mise.kitchen", "mise.eval"].includes(span.instrumentationScope.name)) batch.onEnd(span);
    },
    forceFlush: () => batch.forceFlush(),
    shutdown: () => batch.shutdown(),
  }] : [] });
  tracerProvider.register();
  const meterProvider = new MeterProvider({ resource, readers: metricExporter ? [new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 10_000, exportTimeoutMillis: 1500 })] : [] });
  metrics.setGlobalMeterProvider(meterProvider);
  state.__miseTelemetry = {
    tracer: tracerProvider.getTracer("mise.kitchen", "1"),
    meter: meterProvider.getMeter("mise.kitchen", "1"),
    async flush() { await Promise.allSettled([tracerProvider.forceFlush(), meterProvider.forceFlush({ timeoutMillis: 1500 })]); },
    async shutdown() { await Promise.allSettled([tracerProvider.shutdown(), meterProvider.shutdown()]); },
  };
  return state.__miseTelemetry;
}

export async function flushKitchenTelemetry() { await state.__miseTelemetry?.flush(); }
