import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { AggregationTemporality, DataPointType, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";
import { startKitchenTelemetry } from "@/lib/telemetry";
import { handleMiseMcpRequest } from "@/mcp/server";
import { ObservedMcpTransport, classifyToolResult, observeKitchenCommand } from "@/mcp/observability";
import type { Transport } from "@modelcontextprotocol/server";

const spans = new InMemorySpanExporter();
const metricExporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
let telemetry: ReturnType<typeof startKitchenTelemetry>;
const logs = vi.spyOn(console, "info").mockImplementation(() => {});
const traceId = "11111111111111111111111111111111";
const secret = "SENSITIVE-kitchen-name-and-token";

beforeAll(() => {
  process.env.MCP_PUBLIC_URL = "http://localhost:8787/mcp";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  telemetry = startKitchenTelemetry({ traceExporter: spans, metricExporter });
});
beforeEach(() => { logs.mockClear(); spans.reset(); metricExporter.reset(); });
afterAll(async () => { await telemetry.shutdown(); logs.mockRestore(); });

async function call(name: string, args: unknown, options: Parameters<typeof handleMiseMcpRequest>[1] = {}) {
  const response = await handleMiseMcpRequest(new Request("http://localhost:8787/mcp", {
    method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", traceparent: `00-${traceId}-2222222222222222-01` },
    body: JSON.stringify({ jsonrpc: "2.0", id: secret, method: "tools/call", params: { name, arguments: args } }),
  }), { toolSurface: "baseline", verifyAccessToken: async token => ({ token, clientId: secret, scopes: ["openid"], expiresAt: Date.now() / 1000 + 60, extra: { userId: secret } }), ...options });
  const body = await response.json();
  await telemetry.flush();
  return { status: response.status, body };
}
function events() { return logs.mock.calls.map(([line]) => JSON.parse(String(line))).filter(event => event.event === "kitchen_operation"); }

describe("semantic observations at the real MCP response boundary", () => {
  it("observes default four-tool writes and dependency failure through SDK v2", async () => {
    const requestId = "4fbba759-84ba-49e7-80ef-3c72123b4d21";
    const result = await call("add_items", { requestId, items: [{ name: secret }] }, {
      toolSurface: undefined,
      addItems: async () => { throw new Error(secret); },
    });
    expect(result.body.result.isError).toBe(true);
    expect(events()).toMatchObject([{ layer: "command", operation: "add_items", outcome: "exception", traceId }, { layer: "tool", operation: "add_items", outcome: "tool_error", traceId }]);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
  });

  it("captures schema rejection before a service callback despite HTTP 200", async () => {
    const createPantryItem = vi.fn();
    const result = await call("add_pantry_item", { name: secret, quantity: { amount: "bad", unit: "jar" } }, { createPantryItem });
    expect(result.status).toBe(200);
    expect(result.body.result.isError).toBe(true);
    expect(createPantryItem).not.toHaveBeenCalled();
    expect(events()).toMatchObject([{ layer: "tool", operation: "add_pantry_item", outcome: "tool_error", traceId }]);
    expect(spans.getFinishedSpans()).toHaveLength(1);
    const counters = metricExporter.getMetrics().flatMap(r => r.scopeMetrics.flatMap(scope => scope.metrics)).filter(metric => metric.descriptor.name === "mise.kitchen.operations");
    expect(counters.flatMap(metric => metric.dataPointType === DataPointType.SUM ? metric.dataPoints : [])).toContainEqual(expect.objectContaining({ attributes: { "mise.layer": "tool", "mise.operation": "add_pantry_item", "mise.outcome": "tool_error" }, value: 1 }));
  });

  it("correlates a command exception with the tool error without exporting sensitive text", async () => {
    const result = await call("add_pantry_item", { name: secret }, { createPantryItem: async () => { throw new Error(secret); } });
    expect(result.status).toBe(200);
    expect(result.body.result.isError).toBe(true);
    expect(events()).toMatchObject([{ layer: "command", outcome: "exception", traceId }, { layer: "tool", outcome: "tool_error", traceId }]);
    const finished = spans.getFinishedSpans();
    const command = finished.find(span => span.name === "kitchen.command")!;
    const tool = finished.find(span => span.name === "mcp.tool")!;
    expect(command.parentSpanContext?.spanId).toBe(tool.spanContext().spanId);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(finished.map(span => ({ attributes: span.attributes, events: span.events })))).not.toContain(secret);
    expect(JSON.stringify(metricExporter.getMetrics())).not.toContain(secret);
  });

  it("exposes a successful command followed by failed response serialization", async () => {
    const result = await call("add_pantry_item", { name: secret }, { createPantryItem: async () => ({ ok: true, value: { status: "created", item: {
      id: 42, user_id: secret, name: secret, name_key: secret, quantity: "", quantity_text: "", quantity_value: null, quantity_unit: null, turnover: "high", created_at: new Date("invalid") as unknown as string,
    } } }) });
    expect(result.body.result.isError).toBe(true);
    expect(events()).toMatchObject([{ layer: "command", outcome: "applied", traceId }, { layer: "tool", outcome: "tool_error", traceId }]);
  });

  it("does not count domain rejection as a successful write", async () => {
    const result = await call("set_pantry_item_quantity", { name: secret, quantity: { amount: "1", unit: "jar" } }, { setPantryItemQuantity: async () => ({ ok: true, value: { status: "not_found", name: secret } }) });
    expect(result.body.result.isError).not.toBe(true);
    expect(events()).toMatchObject([{ layer: "command", outcome: "rejected" }, { layer: "tool", outcome: "rejected" }]);
  });

  it("uses bounded labels for untrusted tool names", async () => {
    await call(secret, {});
    expect(events()).toMatchObject([{ operation: "unknown_tool" }]);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
  });

  it("keeps a replayed rejection rejected", () => {
    expect(classifyToolResult({ jsonrpc: "2.0", id: 1, result: { structuredContent: { outcome: { status: "rejected", replayed: true } } } }, "apply_reviewed_receipt_import")).toBe("rejected");
  });

  it("never changes a successful command when the logging sink fails", async () => {
    logs.mockImplementationOnce(() => { throw new Error("log sink down"); });
    const result = { ok: true, value: { status: "created" } };
    expect(await observeKitchenCommand("add_pantry_item", async () => result)()).toBe(result);
  });

  it("preserves the complete MCP response when every info log write fails", async () => {
    logs.mockImplementation(() => { throw new Error("log sink down"); });
    try {
      const result = await call("get_kitchen_context", {}, { loadKitchenContext: async () => ({ pantry: [], tools: [] }) });
      expect(result.status).toBe(200);
      expect(result.body.result.isError).not.toBe(true);
    } finally { logs.mockImplementation(() => {}); }
  });

  it("records delivery failure without swallowing the original transport error", async () => {
    const error = new Error("network disconnected");
    const inner: Transport = { start: async () => {}, close: async () => {}, send: async () => { throw error; } };
    const transport = new ObservedMcpTransport(inner, new Set(["add_pantry_item"]));
    await transport.start();
    inner.onmessage?.({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "add_pantry_item", arguments: {} } });
    await expect(transport.send({ jsonrpc: "2.0", id: 1, result: { structuredContent: { status: "created" } } })).rejects.toBe(error);
    expect(events()).toMatchObject([{ layer: "tool", outcome: "delivery_error" }]);
    await transport.close();
    expect(events()).toHaveLength(1);
  });
});
