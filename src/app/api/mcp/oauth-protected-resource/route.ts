import { getMcpProtectedResourceMetadata } from "@/mcp/auth";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getMcpProtectedResourceMetadata(), {
    headers: { "Cache-Control": "no-store" },
  });
}
