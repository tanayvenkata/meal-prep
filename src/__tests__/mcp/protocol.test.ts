import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMiseHttpServer,
  handleMiseMcpRequest,
} from "@/mcp/server";

let httpServer: Server;
let mcpUrl: string;
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

  httpServer = createMiseHttpServer({
    verifyAccessToken: verifyTestAccessToken,
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
