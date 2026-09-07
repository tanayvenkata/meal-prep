import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { handleMiseMcpRequest } from "./server";
import { getMcpProtectedResourceMetadata, getSupabaseOAuthMetadata } from "./auth";
import { flushKitchenTelemetry } from "@/lib/telemetry";

export type WorkerBindings = {
  DATABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  MCP_PUBLIC_URL?: string;
  MCP_TOKEN_AUDIENCE?: string;
  MISE_TOOL_SURFACE?: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
};

type WorkerContext = Context<{ Bindings: WorkerBindings }>;

export const app = new Hono<{ Bindings: WorkerBindings }>();

// Populate process.env from Cloudflare worker environment bindings when available
app.use("*", async (c, next) => {
  if (c.env) {
    for (const [key, value] of Object.entries(c.env)) {
      if (typeof value === "string" && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
  await next();
});

// Configure CORS for MCP and OAuth discovery
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "Last-Event-ID",
      "MCP-Protocol-Version",
      "MCP-Session-Id",
      "Mcp-Method",
      "Mcp-Name",
      "Mcp-Param-*",
    ],
    exposeHeaders: [
      "MCP-Protocol-Version",
      "MCP-Session-Id",
      "Mcp-Method",
      "Mcp-Name",
      "WWW-Authenticate",
    ],
  }),
);

// Health check endpoints
const healthPayload = () => ({
  status: "healthy",
  runtime: "cloudflare-workers",
  service: "mise-mcp",
});

app.get("/", (c) => c.json(healthPayload()));
app.get("/health", (c) => c.json(healthPayload()));
app.get("/api/mcp/health", (c) => c.json(healthPayload()));

// OAuth Protected Resource Metadata (RFC 8414 / RFC 9207)
const protectedResourceResponse = (c: WorkerContext) =>
  c.json(getMcpProtectedResourceMetadata(), 200, {
    "Cache-Control": "no-store",
  });

app.get("/.well-known/oauth-protected-resource", protectedResourceResponse);
app.get("/.well-known/oauth-protected-resource/mcp", protectedResourceResponse);
app.get("/api/mcp/oauth-protected-resource", protectedResourceResponse);

// OAuth Authorization Server Metadata
const authServerResponse = (c: WorkerContext) =>
  c.json(getSupabaseOAuthMetadata(), 200, {
    "Cache-Control": "no-store",
  });

app.get("/.well-known/oauth-authorization-server", authServerResponse);
app.get("/api/mcp/oauth-authorization-server", authServerResponse);

// MCP request handler
async function handleMcpRoute(c: WorkerContext) {
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  if (c.req.method !== "POST") {
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      },
      405,
    );
  }

  const response = await handleMiseMcpRequest(c.req.raw);
  try {
    c.executionCtx?.waitUntil?.(flushKitchenTelemetry().catch(() => {}));
  } catch {
    // outside Cloudflare Workers execution or in test harness
  }
  return response;
}

app.all("/mcp", handleMcpRoute);
app.all("/api/mcp", handleMcpRoute);
app.post("/", handleMcpRoute);

export default app;
