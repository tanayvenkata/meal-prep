import { createClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export const MCP_SCOPES = ["openid"];

export type McpAuthConfig = {
  resource: URL;
  authorizationServer: URL;
  tokenAudience: string;
};

export function getMcpAuthConfig(): McpAuthConfig {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicUrl = process.env.MCP_PUBLIC_URL ?? "http://localhost:8787/mcp";

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");

  const resource = new URL(publicUrl);
  if (resource.protocol !== "https:" && resource.hostname !== "localhost") {
    throw new Error("MCP_PUBLIC_URL must use HTTPS outside localhost.");
  }

  return {
    resource,
    authorizationServer: new URL("/auth/v1", supabaseUrl),
    tokenAudience: process.env.MCP_TOKEN_AUDIENCE ?? "authenticated",
  };
}

export function getProtectedResourceMetadata(config = getMcpAuthConfig()) {
  return {
    resource: config.resource.href,
    authorization_servers: [config.authorizationServer.href.replace(/\/$/, "")],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
  };
}

export function getResourceMetadataUrl(config = getMcpAuthConfig()) {
  return new URL(
    `/.well-known/oauth-protected-resource${config.resource.pathname}`,
    config.resource.origin,
  );
}

type McpAuthChallengeOptions = {
  error?: "insufficient_scope" | "invalid_token" | null;
  errorDescription?: string;
};

function quoteChallengeValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function getMcpAuthChallenge(
  config = getMcpAuthConfig(),
  {
    error = "insufficient_scope",
    errorDescription = "Connect your Mise account to continue.",
  }: McpAuthChallengeOptions = {},
) {
  const challenge = [
    `Bearer resource_metadata=${quoteChallengeValue(getResourceMetadataUrl(config).href)}`,
    `scope=${quoteChallengeValue(MCP_SCOPES.join(" "))}`,
  ];

  // A first-time 401 is a discovery signal, not an OAuth failure. RFC 6750 says
  // clients should not receive an error code when no credentials were supplied.
  if (error) {
    challenge.push(`error=${quoteChallengeValue(error)}`);
    challenge.push(`error_description=${quoteChallengeValue(errorDescription)}`);
  }

  return challenge.join(", ");
}

export function readBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  return match?.[1] ?? null;
}

type Claims = Record<string, unknown>;

export function authInfoFromClaims(
  token: string,
  claims: Claims,
  config = getMcpAuthConfig(),
): AuthInfo {
  const expectedIssuer = config.authorizationServer.href.replace(/\/$/, "");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const scopes = typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [];

  if (claims.iss !== expectedIssuer) throw new Error("Access token has the wrong issuer.");
  if (!audiences.includes(config.tokenAudience)) {
    throw new Error("Access token has the wrong audience.");
  }
  if (typeof claims.sub !== "string" || !claims.sub) {
    throw new Error("Access token is missing its user identity.");
  }
  if (typeof claims.client_id !== "string" || !claims.client_id) {
    throw new Error("Access token is missing its OAuth client identity.");
  }
  if (claims.role !== "authenticated") {
    throw new Error("Access token is not an authenticated user token.");
  }
  if (typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000) {
    throw new Error("Access token is expired.");
  }
  if (!MCP_SCOPES.every((scope) => scopes.includes(scope))) {
    throw new Error("Access token is missing the required scope.");
  }

  return {
    token,
    clientId: claims.client_id,
    scopes,
    expiresAt: claims.exp,
    resource: config.resource,
    extra: { userId: claims.sub },
  };
}

export async function verifyMcpAccessToken(token: string): Promise<AuthInfo> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase public authentication configuration is required.");
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);

  if (error || !data?.claims) throw new Error("Access token could not be verified.");
  return authInfoFromClaims(token, data.claims as Claims);
}
