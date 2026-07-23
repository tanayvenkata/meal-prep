import { getRequestAuth } from "@/lib/auth";
import {
  createKitchenTool,
  deleteKitchenTool,
  listKitchenTools,
  updateKitchenTool,
} from "@/lib/kitchen-service";

export async function GET(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    return Response.json(await listKitchenTools(auth.userId));
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
    return Response.json(result.value, { status: 201 });
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
    return Response.json(result.value);
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
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/tools failed:", err);
    return Response.json({ error: "failed to delete kitchen tool" }, { status: 500 });
  }
}
