import { describe, expect, it } from "vitest";
import {
  authInfoFromClaims,
  getMcpAuthChallenge,
  getProtectedResourceMetadata,
  readBearerToken,
  type McpAuthConfig,
} from "@/mcp/auth";

const config: McpAuthConfig = {
  resource: new URL("https://mcp.mise.example/mcp"),
  authorizationServer: new URL("https://project.supabase.co/auth/v1"),
  tokenAudience: "authenticated",
};

const validClaims = {
  iss: "https://project.supabase.co/auth/v1",
  aud: "authenticated",
  sub: "user-123",
  client_id: "chatgpt-client",
  role: "authenticated",
  scope: "openid email",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

describe("MCP OAuth boundary", () => {
  it("publishes protected-resource discovery for the Supabase authorization server", () => {
    expect(getProtectedResourceMetadata(config)).toEqual({
      resource: "https://mcp.mise.example/mcp",
      authorization_servers: ["https://project.supabase.co/auth/v1"],
      scopes_supported: ["openid"],
      bearer_methods_supported: ["header"],
    });
    expect(getMcpAuthChallenge(config)).toContain(
      'resource_metadata="https://mcp.mise.example/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("accepts a well-formed bearer token and creates user-scoped auth info", () => {
    expect(readBearerToken("Bearer token-123")).toBe("token-123");
    expect(authInfoFromClaims("token-123", validClaims, config)).toMatchObject({
      clientId: "chatgpt-client",
      scopes: ["openid", "email"],
      extra: { userId: "user-123" },
    });
  });

  it.each([
    ["issuer", { iss: "https://attacker.example/auth/v1" }],
    ["audience", { aud: "anon" }],
    ["OAuth client", { client_id: undefined }],
    ["authenticated user role", { role: "anon" }],
    ["expiry", { exp: 1 }],
    ["required scope", { scope: "email" }],
  ])("rejects a token with the wrong %s", (_label, override) => {
    expect(() =>
      authInfoFromClaims("token-123", { ...validClaims, ...override }, config),
    ).toThrow();
  });

  it("rejects malformed authorization headers", () => {
    expect(readBearerToken(undefined)).toBeNull();
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readBearerToken("Bearer one two")).toBeNull();
  });
});
