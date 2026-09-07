/** Local-only Wrangler smoke entry point. Never deploy this fixture. */
import app from "../../src/mcp/worker";
import { flushKitchenTelemetry } from "../../src/lib/telemetry";
import { ObservedMcpTransport, observeKitchenCommand } from "../../src/mcp/observability";
import type { Transport } from "@modelcontextprotocol/server";

const fixture = {
  async fetch(request: Request, env: Parameters<typeof app.fetch>[1], ctx: Parameters<typeof app.fetch>[2]) {
    // Exercise the production entry point, including startup and the 401 flush.
    const response = await app.fetch(request, env, ctx);
    const secret = "PRIVATE-worker-kitchen-token-prompt";
    const inner: Transport = { start: async () => {}, close: async () => {}, send: async () => {} };
    const transport = new ObservedMcpTransport(inner, new Set(["edit_items"]), "11111111-1111-4111-8111-111111111111");
    await transport.start();
    inner.onmessage?.({ jsonrpc: "2.0", id: secret, method: "tools/call", params: { name: "edit_items", arguments: { name: secret } } });
    await transport.send({ jsonrpc: "2.0", id: secret, result: { structuredContent: { status: "rejected", name: secret } } });
    await observeKitchenCommand("edit_items", async () => { throw new Error(secret); })().catch(() => {});
    await transport.close();
    ctx?.waitUntil(flushKitchenTelemetry());
    return response;
  },
};

export default fixture;
