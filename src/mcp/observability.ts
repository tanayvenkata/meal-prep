import { kitchenTracer, kitchenMeter } from "@/lib/telemetry";
import { randomUUID } from "node:crypto";
import { context, propagation, SpanKind, SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import type {
  JSONRPCMessage,
  RequestId,
  Transport,
  TransportSendOptions,
} from "@modelcontextprotocol/server";

const applied = new Set(["created", "updated", "deleted", "applied"]);
const unchanged = new Set(["unchanged", "already_exists"]);
const rejected = new Set(["not_found", "conflict", "name_conflict", "unsupported_quantity", "unit_mismatch", "insufficient_quantity", "amount_exceeded", "rejected", "request_id_reused"]);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function recordMcpRequest(requestId: string, status: number, durationMs: number) {
  try {
    const meter = kitchenMeter();
    const attributes = { "http.response.status_code": status };
    meter.createCounter("mise.mcp.requests").add(1, attributes);
    meter.createHistogram("mise.mcp.request.duration", { unit: "s" }).record(durationMs / 1000, attributes);
    // Requests rejected before tool dispatch need a trace too (for example, 401).
    // Record only status, duration, and our correlation ID; never bearer tokens.
    const failed = status >= 400 ? kitchenTracer().startSpan("mcp.request", {
      kind: SpanKind.SERVER,
      startTime: Date.now() - durationMs,
      attributes: { ...attributes, "mise.request_id": requestId },
    }) : undefined;
    if (failed) {
      failed.setStatus({ code: SpanStatusCode.ERROR });
      failed.end();
    }
    console.info(JSON.stringify({ event: "mcp_request", requestId, status, durationMs: Math.round(durationMs),
      ...(failed ? { traceId: failed.spanContext().traceId, spanId: failed.spanContext().spanId } : {}) }));
  } catch { /* A logging/export failure must not change an HTTP response. */ }
}

export type KitchenOutcome = "applied" | "unchanged" | "replayed" | "rejected" | "success" | "unclassified" | "invalid_input" | "exception" | "tool_error" | "protocol_error" | "delivery_error" | "interrupted";

function outcomeOf(value: unknown): KitchenOutcome {
  if (!record(value)) return "unclassified";
  // A replayed rejection is still a rejection, not a successful write.
  if (typeof value.status === "string" && rejected.has(value.status)) return "rejected";
  if (value.replayed === true) return "replayed";
  if (typeof value.status === "string" && applied.has(value.status)) return "applied";
  if (typeof value.status === "string" && unchanged.has(value.status)) return "unchanged";
  return "unclassified";
}

export function classifyToolResult(message: JSONRPCMessage, tool: string): KitchenOutcome {
  if ("error" in message) return "protocol_error";
  if (!("result" in message) || !record(message.result)) return "unclassified";
  if (message.result.isError === true) return "tool_error";
  const content = message.result.structuredContent;
  if ((tool === "get_kitchen_context" || tool === "read_kitchen" || tool === "show_kitchen") && record(content) && Array.isArray(content.pantry) && Array.isArray(content.tools)) return "success";
  return outcomeOf(record(content) && record(content.outcome) ? content.outcome : content);
}

function finish(span: Span, layer: "tool" | "command", name: string, outcome: KitchenOutcome, started: number, requestId?: string) {
  // Only bounded enums and server-owned names become metric labels. No arguments,
  // result content, identities, exception messages, or client request IDs are logged.
  const attributes = { "mise.layer": layer, "mise.operation": name, "mise.outcome": outcome };
  const duration = (performance.now() - started) / 1000;
  try {
    span.setAttributes(attributes);
    // Server-generated HTTP correlation ID belongs on traces, never metric labels.
    if (requestId) span.setAttribute("mise.request_id", requestId);
    if (["exception", "tool_error", "protocol_error", "delivery_error", "interrupted", "unclassified"].includes(outcome)) span.setStatus({ code: SpanStatusCode.ERROR });
    const meter = kitchenMeter();
    meter.createCounter("mise.kitchen.operations", { description: "Observed command or MCP tool outcomes" }).add(1, attributes);
    meter.createHistogram("mise.kitchen.duration", { unit: "s" }).record(duration, attributes);
    const spanContext = span.spanContext();
    console.info(JSON.stringify({ event: "kitchen_operation", layer, operation: name, outcome,
      durationMs: Math.round(duration * 1000), ...(requestId ? { requestId } : {}),
      ...(spanContext.traceId !== "00000000000000000000000000000000" ? { traceId: spanContext.traceId, spanId: spanContext.spanId } : {}) }));
  } catch { /* Observability must never turn a committed write into an error. */ }
  finally { span.end(); }
}

/** Wrap shared service calls, preserving their result and thrown error verbatim. */
export function observeKitchenCommand<A extends unknown[], R>(name: string, command: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args) => kitchenTracer().startActiveSpan("kitchen.command", async span => {
    const started = performance.now();
    let outcome: KitchenOutcome = "exception";
    try {
      const result = await command(...args);
      outcome = record(result) && result.ok === false ? "invalid_input"
        : name === "get_kitchen_context" ? "success"
        : outcomeOf(record(result) && result.ok === true ? result.value : result);
      return result;
    } finally { finish(span, "command", name, outcome, started); }
  });
}

/**
 * Public MCP Transport decorator. The SDK has no post-validation result observer;
 * observing send catches schema rejection and output failures outside callbacks.
 * It forwards protocol messages unchanged, including the existing OpenAI adapter.
 */
export class ObservedMcpTransport implements Transport {
  onmessage?: Transport["onmessage"];
  onclose?: Transport["onclose"];
  onerror?: Transport["onerror"];
  private pending = new Map<RequestId, { span: Span; name: string; started: number }>();

  constructor(private inner: Transport, private tools: ReadonlySet<string>, private requestId: string = randomUUID()) {}
  get sessionId() { return this.inner.sessionId; }
  setProtocolVersion(version: string) { this.inner.setProtocolVersion?.(version); }

  async start() {
    this.inner.onmessage = (message, extra) => {
      if ("method" in message && message.method === "tools/call" && "id" in message) {
        const proposed = message.params?.name;
        const name = typeof proposed === "string" && this.tools.has(proposed) ? proposed : "unknown_tool";
        const headers = extra?.request
          ? Object.fromEntries(extra.request.headers.entries())
          : (extra as { requestInfo?: { headers?: Record<string, string> } } | undefined)?.requestInfo?.headers ?? {};
        const parent = propagation.extract(context.active(), headers);
        const span = kitchenTracer().startSpan("mcp.tool", { kind: SpanKind.SERVER, attributes: { "mise.operation": name } }, parent);
        this.pending.set(message.id, { span, name, started: performance.now() });
        context.with(trace.setSpan(parent, span), () => this.onmessage?.(message, extra));
      } else this.onmessage?.(message, extra);
    };
    this.inner.onerror = error => this.onerror?.(error);
    this.inner.onclose = () => {
      for (const id of this.pending.keys()) this.end(id, "interrupted");
      this.onclose?.();
    };
    await this.inner.start();
  }

  private end(id: RequestId, outcome: KitchenOutcome) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    finish(pending.span, "tool", pending.name, outcome, pending.started, this.requestId);
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions) {
    const id = "id" in message ? message.id : undefined;
    const pending = id !== undefined ? this.pending.get(id) : undefined;
    if (pending && id !== undefined && ("result" in message || "error" in message)) {
      this.pending.delete(id);
      try {
        await this.inner.send(message, options);
        finish(pending.span, "tool", pending.name, classifyToolResult(message, pending.name), pending.started, this.requestId);
      } catch (error) {
        finish(pending.span, "tool", pending.name, "delivery_error", pending.started, this.requestId);
        throw error;
      }
      return;
    }
    await this.inner.send(message, options);
  }

  async close() {
    try { await this.inner.close(); }
    finally { for (const id of this.pending.keys()) this.end(id, "interrupted"); }
  }
}
