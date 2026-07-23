export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", service: "mise-mcp" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
