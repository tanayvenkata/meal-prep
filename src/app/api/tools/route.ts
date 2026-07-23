import { getRequestAuth } from "@/lib/auth";
import {
  createKitchenTool,
  deleteKitchenTool,
  listKitchenTools,
  updateKitchenTool,
} from "@/lib/kitchen-service";
import type { KitchenTool } from "@/lib/db";

function toKitchenToolResponse(tool: KitchenTool) {
  return {
    id: tool.id,
    name: tool.name,
    kind: tool.kind,
    created_at: tool.created_at,
  };
}

export async function GET(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const tools = await listKitchenTools(auth.userId);
    return Response.json(tools.map(toKitchenToolResponse));
  } catch (err) {
    console.error("GET /api/tools failed:", err);
    return Response.json({ error: "failed to fetch kitchen tools" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (auth.oauthClientId) {
    return Response.json({ error: "oauth client is read-only" }, { status: 403 });
  }

  const input = await request.json();

  try {
    const result = await createKitchenTool(auth.userId, input);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    if (result.value.status === "already_exists") {
      return Response.json(
        {
          code: "already_exists",
          error: "That kitchen tool already exists.",
          existingTool: toKitchenToolResponse(result.value.tool),
        },
        { status: 409 },
      );
    }
    return Response.json(toKitchenToolResponse(result.value.tool), {
      status: 201,
    });
  } catch (err) {
    console.error("POST /api/tools failed:", err);
    return Response.json({ error: "failed to add kitchen tool" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (auth.oauthClientId) {
    return Response.json({ error: "oauth client is read-only" }, { status: 403 });
  }

  const input = await request.json();

  try {
    const result = await updateKitchenTool(auth.userId, input);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    switch (result.value.status) {
      case "updated":
      case "unchanged":
        return Response.json(toKitchenToolResponse(result.value.tool));
      case "not_found":
        return Response.json(
          {
            code: "not_found",
            error: "That kitchen tool no longer exists.",
            id: result.value.id,
          },
          { status: 404 },
        );
      case "name_conflict":
        return Response.json(
          {
            code: "name_conflict",
            error: "Another kitchen tool already uses that name.",
            id: result.value.id,
            conflictingTool: toKitchenToolResponse(
              result.value.conflictingTool,
            ),
          },
          { status: 409 },
        );
    }
  } catch (err) {
    console.error("PUT /api/tools failed:", err);
    return Response.json({ error: "failed to update kitchen tool" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (auth.oauthClientId) {
    return Response.json({ error: "oauth client is read-only" }, { status: 403 });
  }

  const input = await request.json();

  try {
    const result = await deleteKitchenTool(auth.userId, input);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    if (result.value.status === "not_found") {
      return Response.json(
        {
          code: "not_found",
          error: "That kitchen tool no longer exists.",
          id: result.value.id,
        },
        { status: 404 },
      );
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/tools failed:", err);
    return Response.json({ error: "failed to delete kitchen tool" }, { status: 500 });
  }
}
