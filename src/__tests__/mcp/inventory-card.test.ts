import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleMiseMcpRequest } from "@/mcp/server";
import { inventoryHtml, inventoryResourceUri } from "@/mcp/inventory-ui/generated";

const loadKitchenContext = vi.fn(async (userId: string) => ({ pantry: [], tools: [{ id: "00000000-0000-4000-8000-000000000001", name: `${userId}'s cooker`, kind: "appliance" }] }));
async function request(method: string, params?: unknown, token: string | null = "user-a", inventoryUi = true) {
  vi.stubEnv("MISE_INVENTORY_UI", inventoryUi ? "1" : "0");
  return handleMiseMcpRequest(new Request("https://mise.example/mcp", {
    method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }), { toolSurface: "four", loadKitchenContext,
    verifyAccessToken: async token => ({ token, clientId: "fixture-client", scopes: ["openid"], expiresAt: Date.now() / 1000 + 60, extra: { userId: token } }),
  });
}
beforeEach(() => {
  vi.stubEnv("MCP_PUBLIC_URL", "https://mise.example/mcp");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  loadKitchenContext.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("opt-in saved kitchen card over MCP HTTP", () => {
  it("initializes and links only the presentation tool to a self-contained resource", async () => {
    const initialized = await request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "fixture", version: "1" } });
    expect(initialized.status).toBe(200);
    const catalog = (await (await request("tools/list")).json()).result.tools;
    const card = catalog.find((tool: { name: string }) => tool.name === "show_kitchen");
    expect(card._meta.ui.resourceUri).toBe(inventoryResourceUri);
    expect(card.annotations.readOnlyHint).toBe(true);
    expect(card.securitySchemes).toEqual([{ type: "oauth2", scopes: ["openid"] }]);
    expect(catalog.filter((tool: { _meta: { ui?: unknown } }) => tool._meta.ui)).toHaveLength(1);
    const resource = (await (await request("resources/read", { uri: inventoryResourceUri })).json()).result.contents[0];
    expect(resource.mimeType).toBe("text/html;profile=mcp-app");
    expect(resource.text).toBe(inventoryHtml);
    expect(resource._meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [] });
    expect(resource.text).not.toContain('<script src=');
    expect(loadKitchenContext).not.toHaveBeenCalled();
  });
  it("preserves the default four-tool surface", async () => {
    const catalog = (await (await request("tools/list", undefined, "user-a", false)).json()).result.tools;
    expect(catalog.map((tool: { name: string }) => tool.name)).toEqual(["read_kitchen", "add_items", "edit_items", "remove_items"]);
  });
  it("loads each caller's data and refreshes through the existing data tool", async () => {
    for (const [token, name] of [["user-a", "show_kitchen"], ["user-b", "show_kitchen"], ["user-a", "read_kitchen"]]) {
      const result = (await (await request("tools/call", { name, arguments: {} }, token)).json()).result;
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent.tools[0].name).toBe(`${token}'s cooker`);
      expect(result._meta["mise/refreshTool"]).toBe("read_kitchen");
      expect(Number.isFinite(Date.parse(result._meta["mise/readAt"]))).toBe(true);
    }
    expect(loadKitchenContext.mock.calls.map(([user]) => user)).toEqual(["user-a", "user-b", "user-a"]);
  });
  it("rejects unauthenticated calls and model-supplied saved inventories", async () => {
    const anonymous = await request("tools/call", { name: "show_kitchen", arguments: {} }, null);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toContain("Bearer");
    const invalid = await (await request("tools/call", { name: "show_kitchen", arguments: { userId: "other", pantry: [{ name: "Invented eggs" }] } })).json();
    expect(invalid.result?.isError || invalid.error).toBeTruthy();
    expect(loadKitchenContext).not.toHaveBeenCalled();
  });
  it("does not turn a failed service read into an empty saved pantry", async () => {
    loadKitchenContext.mockRejectedValueOnce(new Error("fixture failure"));
    const body = await (await request("tools/call", { name: "show_kitchen", arguments: {} })).json();
    expect(body.result?.isError || body.error).toBeTruthy();
    expect(body.result?.structuredContent).toBeUndefined();
  });
});
