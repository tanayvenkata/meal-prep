import { trace, metrics } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { createServer } from "node:http";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { startKitchenTelemetry } from "@/lib/telemetry";
import { observeKitchenCommand, ObservedMcpTransport } from "@/mcp/observability";
import type { Transport } from "@modelcontextprotocol/server";

// Real OTLP HTTP serialization and authentication, with no database or cloud account.
const received: { path?: string; auth?: string; body: string }[] = [];
let stall = false;
const collector = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  received.push({ path: req.url, auth: req.headers.authorization, body });
  if (stall) return;
  res.writeHead(200, { "content-type": "application/json" }).end("{}");
});
let telemetry: ReturnType<typeof startKitchenTelemetry>;
const secret = "PRIVATE-prompt-token-user-food";
const logs = vi.spyOn(console, "info").mockImplementation(() => {});

beforeAll(async () => {
  await new Promise<void>(resolve => collector.listen(0, "127.0.0.1", resolve));
  const address = collector.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP collector");
  const base = `http://127.0.0.1:${address.port}`;
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", `${base}/otlp/`);
  vi.stubEnv("OTEL_EXPORTER_OTLP_HEADERS", "Authorization=Basic%20fixture%3D%3D");
  vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", `${base}/custom-traces`);
  vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_HEADERS", "Authorization=Bearer%20trace-fixture");
  vi.stubEnv("MISE_ENVIRONMENT", "production");
  // Hosting platforms may already own the global providers. Mise must still export.
  trace.setGlobalTracerProvider(new NodeTracerProvider());
  metrics.setGlobalMeterProvider(new MeterProvider());
  telemetry = startKitchenTelemetry({ runtime: "vercel", release: "a".repeat(40) });
});
afterAll(async () => {
  await telemetry?.shutdown();
  collector.closeAllConnections();
  await new Promise<void>(resolve => collector.close(() => resolve()));
  vi.unstubAllEnvs();
  logs.mockRestore();
});

it("exports authenticated traces and metrics with correlation and no sensitive payloads", async () => {
  const requestId = "11111111-1111-4111-8111-111111111111";
  const inner: Transport = { start: async () => {}, close: async () => {}, send: async () => {} };
  const transport = new ObservedMcpTransport(inner, new Set(["edit_items"]), requestId);
  await transport.start();
  inner.onmessage?.({ jsonrpc: "2.0", id: secret, method: "tools/call", params: { name: "edit_items", arguments: { prompt: secret } } });
  await transport.send({ jsonrpc: "2.0", id: secret, result: { structuredContent: { status: "rejected", name: secret } } });
  await expect(observeKitchenCommand("edit_items", async () => { throw new Error(secret); })()).rejects.toThrow(secret);
  await telemetry.flush();
  const traces = received.find(entry => entry.path === "/custom-traces")!;
  const metrics = received.find(entry => entry.path === "/otlp/v1/metrics")!;
  expect(traces.auth).toBe("Bearer trace-fixture");
  expect(metrics.auth).toBe("Basic fixture==");
  expect(traces.body).toContain(requestId);
  expect(traces.body).toContain('"rejected"');
  expect(traces.body).toContain('"exception"');
  expect(traces.body).toContain('"vercel"');
  expect(traces.body).toContain('"production"');
  expect(metrics.body).toContain("mise.kitchen.duration");
  expect(metrics.body).not.toContain(requestId);
  for (const entry of received) expect(entry.body).not.toContain(secret);
  expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
  await transport.close();
});

it("bounds a stalled collector flush without changing the command result", async () => {
  stall = true;
  const result = { status: "updated" };
  expect(await observeKitchenCommand("edit_items", async () => result)()).toBe(result);
  const started = performance.now();
  await telemetry.flush();
  expect(performance.now() - started).toBeLessThan(2500);
  stall = false;
});
