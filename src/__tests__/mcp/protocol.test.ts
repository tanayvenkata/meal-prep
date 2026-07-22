import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMiseHttpServer } from "@/mcp/server";

let httpServer: Server;
let mcpUrl: string;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalMcpPublicUrl = process.env.MCP_PUBLIC_URL;

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
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

  httpServer = createMiseHttpServer({
    verifyAccessToken: async (token): Promise<AuthInfo> => {
      if (token !== "test-token") throw new Error("Invalid test token.");
      return {
        token,
        clientId: "chatgpt-test-client",
        scopes: ["openid"],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        resource: new URL("https://mcp.mise.example/mcp"),
        extra: { userId: "user-123" },
      };
    },
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
    expect(tool?.securitySchemes).toEqual(expectedSchemes);
    expect((tool?._meta as Record<string, unknown>).securitySchemes).toEqual(
      expectedSchemes,
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
