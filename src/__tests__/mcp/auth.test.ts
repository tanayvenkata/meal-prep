import { describe, expect, it } from "vitest";
import {
  authInfoFromClaims,
  getMcpAuthChallenge,
  getResourceMetadataUrl,
  getSupabaseOAuthMetadata,
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
  it("describes Supabase as the authorization server", () => {
    expect(getSupabaseOAuthMetadata(config)).toMatchObject({
      issuer: "https://project.supabase.co/auth/v1",
      authorization_endpoint:
        "https://project.supabase.co/auth/v1/oauth/authorize",
      token_endpoint: "https://project.supabase.co/auth/v1/oauth/token",
      registration_endpoint:
        "https://project.supabase.co/auth/v1/oauth/clients/register",
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
    });
    expect(getResourceMetadataUrl(config).href).toBe(
      "https://mcp.mise.example/.well-known/oauth-protected-resource/mcp",
    );
    expect(getMcpAuthChallenge(config)).toContain(
      'resource_metadata="https://mcp.mise.example/.well-known/oauth-protected-resource/mcp"',
    );
    expect(getMcpAuthChallenge(config)).toContain('error="insufficient_scope"');
    expect(getMcpAuthChallenge(config)).toContain(
      'error_description="Connect your Mise account to continue."',
    );
  });

  it("accepts verified claims and creates user-scoped auth info", () => {
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
});
