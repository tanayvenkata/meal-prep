import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
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

async function postMcp(body: Record<string, unknown>) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify(body),
  });

  expect(response.status).toBe(200);
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.MCP_PUBLIC_URL = "https://mcp.mise.example/mcp";

  httpServer = createMiseHttpServer();
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
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    const result = response.result as { tools: Array<Record<string, unknown>> };
    const tool = result.tools.find(({ name }) => name === "get_kitchen_context");
    const expectedSchemes = [{ type: "oauth2", scopes: ["openid"] }];

    expect(tool).toBeDefined();
    expect(tool?.securitySchemes).toEqual(expectedSchemes);
    expect((tool?._meta as Record<string, unknown>).securitySchemes).toEqual(
      expectedSchemes,
    );
  });

  it("returns a complete OAuth challenge when the tool has no access token", async () => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_kitchen_context", arguments: {} },
    });

    const result = response.result as {
      isError: boolean;
      _meta: { "mcp/www_authenticate": string[] };
    };
    const [challenge] = result._meta["mcp/www_authenticate"];

    expect(result.isError).toBe(true);
    expect(challenge).toContain(
      'resource_metadata="https://mcp.mise.example/.well-known/oauth-protected-resource/mcp"',
    );
    expect(challenge).toContain('scope="openid"');
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain(
      'error_description="Connect your Mise account to continue."',
    );
  });
});
