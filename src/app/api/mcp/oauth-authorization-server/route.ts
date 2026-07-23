import { getSupabaseOAuthMetadata } from "@/mcp/auth";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getSupabaseOAuthMetadata(), {
    headers: { "Cache-Control": "no-store" },
  });
}
