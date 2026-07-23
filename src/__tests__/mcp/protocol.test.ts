import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMiseHttpServer,
  handleMiseMcpRequest,
} from "@/mcp/server";
import { kitchenWidgetResource } from "@/mcp/kitchen-widget.generated";

let httpServer: Server;
let mcpUrl: string;
const mockLoadKitchenContext = vi.fn(
  async (userId: string) => {
    void userId;
    return {
      pantry: [{ name: "Rice", quantity: "2 cups", turnover: "high" as const }],
      tools: [{ name: "Dutch oven", kind: "cookware" }],
    };
  },
);
const mockSetPantryItemQuantity = vi.fn<
  typeof import("@/lib/kitchen-service").setPantryItemQuantity
>();
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalMcpPublicUrl = process.env.MCP_PUBLIC_URL;

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function verifyTestAccessToken(token: string): Promise<AuthInfo> {
  if (token !== "test-token") throw new Error("Invalid test token.");
  return {
    token,
    clientId: "chatgpt-test-client",
    scopes: ["openid"],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    resource: new URL("https://mcp.mise.example/mcp"),
    extra: { userId: "user-123" },
  };
}

async function postMcp(body: Record<string, unknown>, token?: string) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-11-25",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  return response;
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.MCP_PUBLIC_URL = "https://mcp.mise.example/mcp";
  mockLoadKitchenContext.mockReset();
  mockLoadKitchenContext.mockResolvedValue({
    pantry: [{ name: "Rice", quantity: "2 cups", turnover: "high" }],
    tools: [{ name: "Dutch oven", kind: "cookware" }],
  });
  mockSetPantryItemQuantity.mockReset();
  mockSetPantryItemQuantity.mockResolvedValue({
    ok: true,
    value: {
      status: "updated",
      name: "Eggs",
      beforeQuantity: "12",
      quantity: "6",
    },
  });

  httpServer = createMiseHttpServer({
    verifyAccessToken: verifyTestAccessToken,
    loadKitchenContext: mockLoadKitchenContext,
    setPantryItemQuantity: mockSetPantryItemQuantity,
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address() as AddressInfo;
  mcpUrl = `http://127.0.0.1:${address.port}/mcp`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
  restoreEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL", originalSupabaseUrl);
  restoreEnvironmentVariable("MCP_PUBLIC_URL", originalMcpPublicUrl);
});

describe("Mise MCP OAuth wire contract", () => {
  it("publishes SDK-generated protected-resource metadata", async () => {
    const response = await fetch(
      new URL("/.well-known/oauth-protected-resource/mcp", mcpUrl),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: "https://mcp.mise.example/mcp",
      authorization_servers: ["https://project.supabase.co/auth/v1"],
      scopes_supported: ["openid"],
      resource_name: "Mise",
    });
  });

  it("republishes the Supabase authorization endpoints", async () => {
    const response = await fetch(
      new URL("/.well-known/oauth-authorization-server", mcpUrl),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      issuer: "https://project.supabase.co/auth/v1",
      authorization_endpoint:
        "https://project.supabase.co/auth/v1/oauth/authorize",
      token_endpoint: "https://project.supabase.co/auth/v1/oauth/token",
      registration_endpoint:
        "https://project.supabase.co/auth/v1/oauth/clients/register",
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("initializes an authenticated stateless MCP request", async () => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "mise-contract-test", version: "1.0.0" },
      },
    }, "test-token");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        protocolVersion: "2025-11-25",
        serverInfo: { name: "mise", version: "0.1.0" },
        capabilities: {
          tools: {},
          resources: {},
        },
        instructions: expect.stringContaining(
          "Never infer a pantry write from recipe planning",
        ),
      },
    });
  });

  it("publishes OAuth security schemes at the top level and in the compatibility mirror", async () => {
    const httpResponse = await postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }, "test-token");
    expect(httpResponse.status).toBe(200);
    const response = (await httpResponse.json()) as Record<string, unknown>;

    const result = response.result as { tools: Array<Record<string, unknown>> };
    const tool = result.tools.find(({ name }) => name === "get_kitchen_context");
    const expectedSchemes = [{ type: "oauth2", scopes: ["openid"] }];

    expect(tool).toBeDefined();
    expect(tool?.description).toContain("Use this when");
    expect(tool?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(tool?.outputSchema).toMatchObject({
      type: "object",
      properties: {
        pantry: { type: "array" },
        tools: { type: "array" },
      },
      required: ["pantry", "tools"],
    });
    expect(tool?.securitySchemes).toEqual(expectedSchemes);
    expect(tool?._meta).toMatchObject({
      securitySchemes: expectedSchemes,
      ui: { resourceUri: kitchenWidgetResource.uri },
    });
  });

  it("calls the shared kitchen service with the authenticated user ID", async () => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "get_kitchen_context",
        arguments: {},
      },
    }, "test-token");

    expect(response.status).toBe(200);
    const body = await response.json() as {
      result: {
        structuredContent: {
          pantry: Array<Record<string, unknown>>;
          tools: Array<Record<string, unknown>>;
        };
      };
    };
    expect(body).toMatchObject({
      result: {
        content: [
          { type: "text", text: "Returned your Mise kitchen context." },
        ],
        structuredContent: {
          pantry: [
            { name: "Rice", quantity: "2 cups", turnover: "high" },
          ],
          tools: [{ name: "Dutch oven", kind: "cookware" }],
        },
      },
    });
    expect(mockLoadKitchenContext).toHaveBeenCalledWith("user-123");
    expect(Object.keys(body.result.structuredContent.pantry[0])).toEqual([
      "name",
      "quantity",
      "turnover",
    ]);
    expect(Object.keys(body.result.structuredContent.tools[0])).toEqual([
      "name",
      "kind",
    ]);
  });

  it("publishes and executes the retry-safe pantry quantity tool", async () => {
    const listResponse = await postMcp({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/list",
    }, "test-token");
    const listBody = await listResponse.json() as {
      result: { tools: Array<Record<string, unknown>> };
    };
    const tool = listBody.result.tools.find(
      ({ name }) => name === "set_pantry_item_quantity",
    );
    const expectedSchemes = [{ type: "oauth2", scopes: ["openid"] }];

    expect(tool).toMatchObject({
      description: expect.stringContaining("Use this when"),
      inputSchema: {
        type: "object",
        required: ["name", "quantity"],
      },
      outputSchema: {
        type: "object",
        required: ["status", "name"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: expectedSchemes,
      _meta: { securitySchemes: expectedSchemes },
    });
    expect((tool?._meta as Record<string, unknown>).ui).toBeUndefined();

    const callResponse = await postMcp({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "set_pantry_item_quantity",
        arguments: { name: " Eggs ", quantity: " 6 " },
      },
    }, "test-token");
    const callBody = await callResponse.json() as {
      result: {
        content: Array<{ type: string; text: string }>;
        structuredContent: Record<string, unknown>;
      };
    };

    expect(callResponse.status).toBe(200);
    expect(callBody).toEqual({
      result: {
        content: [{ type: "text", text: "Set Eggs from 12 to 6." }],
        structuredContent: {
          status: "updated",
          name: "Eggs",
          beforeQuantity: "12",
          quantity: "6",
        },
      },
      jsonrpc: "2.0",
      id: 10,
    });
    expect(mockSetPantryItemQuantity).toHaveBeenCalledWith("user-123", {
      name: "Eggs",
      quantity: "6",
    });
    expect(Object.keys(callBody.result.structuredContent)).toEqual([
      "status",
      "name",
      "beforeQuantity",
      "quantity",
    ]);
  });

  it("delivers the widget resource with an explicit no-network CSP", async () => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 8,
      method: "resources/read",
      params: { uri: kitchenWidgetResource.uri },
    }, "test-token");
    const body = await response.json() as {
      result: {
        contents: Array<{
          uri: string;
          mimeType: string;
          text: string;
          _meta: {
            ui: {
              csp: {
                connectDomains: string[];
                resourceDomains: string[];
              };
            };
          };
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.result.contents[0]).toMatchObject({
      uri: kitchenWidgetResource.uri,
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          csp: {
            connectDomains: [],
            resourceDomains: [],
          },
        },
      },
    });
    expect(body.result.contents[0].text).toContain('<div id="root"></div>');
    expect(body.result.contents[0].text).toContain(
      "No pantry items saved yet.",
    );
    expect(body.result.contents[0].text).toContain(
      "No kitchen tools saved yet.",
    );
  });

  it("serves the same authenticated tool contract through the Web-standard hosted transport", async () => {
    const request = new Request("https://mcp.mise.example/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: "Bearer test-token",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/list",
      }),
    });
    const response = await handleMiseMcpRequest(request, {
      verifyAccessToken: verifyTestAccessToken,
      loadKitchenContext: mockLoadKitchenContext,
      setPantryItemQuantity: mockSetPantryItemQuantity,
    });
    const body = (await response.json()) as {
      result: { tools: Array<Record<string, unknown>> };
    };
    const tool = body.result.tools.find(
      ({ name }) => name === "get_kitchen_context",
    );

    expect(response.status).toBe(200);
    expect(tool?.securitySchemes).toEqual([
      { type: "oauth2", scopes: ["openid"] },
    ]);
  });

  it("keeps OAuth discovery fail-closed on the hosted transport", async () => {
    const response = await handleMiseMcpRequest(
      new Request("https://mcp.mise.example/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
          method: "initialize",
        }),
      }),
      { verifyAccessToken: verifyTestAccessToken },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://mcp.mise.example/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("rejects invalid tokens through the hosted transport", async () => {
    const response = await handleMiseMcpRequest(
      new Request("https://mcp.mise.example/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer expired-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 6,
          method: "initialize",
        }),
      }),
      { verifyAccessToken: verifyTestAccessToken },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="invalid_token"',
    );
  });

  it("starts OAuth discovery before exposing MCP to an unauthenticated client", async () => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
    });
    const challenge = response.headers.get("www-authenticate") ?? "";

    expect(response.status).toBe(401);
    expect(challenge).toContain(
      'resource_metadata="https://mcp.mise.example/.well-known/oauth-protected-resource/mcp"',
    );
    expect(challenge).toContain('scope="openid"');
    expect(challenge).not.toContain("error=");
  });

  it("rejects an invalid bearer token with a reauthorization challenge", async () => {
    const response = await postMcp(
      { jsonrpc: "2.0", id: 3, method: "initialize" },
      "expired-token",
    );
    const challenge = response.headers.get("www-authenticate") ?? "";

    expect(response.status).toBe(401);
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain(
      'error_description="The Mise access token is invalid or expired."',
    );
  });
});
