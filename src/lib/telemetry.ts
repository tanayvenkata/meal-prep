import { metrics } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor, type SpanExporter } from "@opentelemetry/sdk-trace-base";
import { MeterProvider, PeriodicExportingMetricReader, type PushMetricExporter } from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";

type Telemetry = { flush: () => Promise<void>; shutdown: () => Promise<void> };
let telemetry: Telemetry | undefined;

/** Manual spans only: no SQL, HTTP headers, prompts, or kitchen data capture. */
export function startKitchenTelemetry(exporters: { traceExporter?: SpanExporter; metricExporter?: PushMetricExporter; release?: string } = {}): Telemetry {
  if (telemetry) return telemetry;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const traceExporter = exporters.traceExporter ?? (endpoint ? new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces`, timeoutMillis: 1000 }) : undefined);
  const metricExporter = exporters.metricExporter ?? (endpoint ? new OTLPMetricExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/metrics`, timeoutMillis: 1000 }) : undefined);
  // Distinct process identities prevent counters from different workers from
  // being mistaken for one stream that repeatedly resets.
  const proposedRelease = exporters.release ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.MISE_RELEASE ?? "";
  const release = /^[a-f0-9]{40,64}$/.test(proposedRelease) ? proposedRelease : "development";
  const resource = resourceFromAttributes({ "service.name": "mise-kitchen", "service.version": release, "service.instance.id": randomUUID() });
  const tracerProvider = new NodeTracerProvider({ resource, spanProcessors: traceExporter ? [new BatchSpanProcessor(traceExporter, { scheduledDelayMillis: 1000, exportTimeoutMillis: 1500 })] : [] });
  tracerProvider.register();
  const meterProvider = new MeterProvider({ resource, readers: metricExporter ? [new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 10_000, exportTimeoutMillis: 1500 })] : [] });
  metrics.setGlobalMeterProvider(meterProvider);
  telemetry = {
    async flush() { await Promise.allSettled([tracerProvider.forceFlush(), meterProvider.forceFlush({ timeoutMillis: 1500 })]); },
    async shutdown() { await Promise.allSettled([tracerProvider.shutdown(), meterProvider.shutdown()]); },
  };
  return telemetry;
}

export async function flushKitchenTelemetry() { await telemetry?.flush(); }
