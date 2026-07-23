import type { NextConfig } from "next";

function getMcpDevHostname() {
  const publicUrl = process.env.MCP_PUBLIC_URL;
  if (!publicUrl) return undefined;

  try {
    return new URL(publicUrl).hostname;
  } catch {
    return undefined;
  }
}

const mcpDevHostname = getMcpDevHostname();

const nextConfig: NextConfig = {
  // OAuth dogfood routes the local Next consent UI through the same HTTPS
  // tunnel as MCP. Next blocks cross-origin dev assets unless that public host
  // is explicit; derive it from the same canonical MCP URL to avoid a second
  // tunnel setting that can drift.
  ...(mcpDevHostname ? { allowedDevOrigins: [mcpDevHostname] } : {}),
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource/mcp",
        destination: "/api/mcp/oauth-protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/mcp/oauth-authorization-server",
      },
    ];
  },
};

export default nextConfig;
