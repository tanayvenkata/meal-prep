import { handleMiseMcpRequest } from "@/mcp/server";
import { after } from "next/server";
import { flushKitchenTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version, MCP-Session-Id, Mcp-Method, Mcp-Name, Mcp-Param-*",
  "Access-Control-Expose-Headers":
    "MCP-Protocol-Version, MCP-Session-Id, Mcp-Method, Mcp-Name, WWW-Authenticate",
};

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function methodNotAllowed() {
  return withCors(
    Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      },
      { status: 405 },
    ),
  );
}

export async function POST(request: Request) {
  after(flushKitchenTelemetry);
  return withCors(await handleMiseMcpRequest(request));
}

export function GET() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
