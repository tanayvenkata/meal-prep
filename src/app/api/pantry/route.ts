import { getRequestAuth } from "@/lib/auth";
import {
  createPantryItem,
  deletePantryItem,
  listPantryItems,
  updatePantryItem,
} from "@/lib/kitchen-service";

export async function GET(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const items = await listPantryItems(auth.userId);
    return Response.json(items);
  } catch (err) {
    console.error("GET /api/pantry failed:", err);
    return Response.json({ error: "failed to fetch items" }, { status: 500 });
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
    const result = await createPantryItem(auth.userId, input);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json(result.value, { status: 201 });
  } catch (err) {
    console.error("POST /api/pantry failed:", err);
    return Response.json({ error: "failed to add item" }, { status: 500 });
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
    const result = await updatePantryItem(auth.userId, input);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json(result.value);
  } catch (err) {
    console.error("PUT /api/pantry failed:", err);
    return Response.json({ error: "failed to update item" }, { status: 500 });
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
    const result = await deletePantryItem(auth.userId, input);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/pantry failed:", err);
    return Response.json({ error: "failed to delete item" }, { status: 500 });
  }
}
