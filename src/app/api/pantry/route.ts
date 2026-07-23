import { getRequestAuth } from "@/lib/auth";
import {
  createPantryItem,
  deletePantryItem,
  listPantryItems,
  updatePantryItem,
} from "@/lib/kitchen-service";
import type { Item } from "@/lib/db";

function toPantryItemResponse(item: Item) {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    turnover: item.turnover,
    created_at: item.created_at,
  };
}

export async function GET(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const items = await listPantryItems(auth.userId);
    return Response.json(items.map(toPantryItemResponse));
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

    const outcome = result.value;
    if (outcome.status === "already_exists") {
      return Response.json(
        {
          code: "already_exists",
          error: "That pantry item already exists.",
          existingItem: toPantryItemResponse(outcome.item),
        },
        { status: 409 },
      );
    }

    return Response.json(toPantryItemResponse(outcome.item), { status: 201 });
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

    const outcome = result.value;
    switch (outcome.status) {
      case "updated":
      case "unchanged":
        return Response.json(toPantryItemResponse(outcome.item));
      case "not_found":
        return Response.json(
          {
            code: "not_found",
            error: "That pantry item no longer exists.",
            id: outcome.id,
          },
          { status: 404 },
        );
      case "name_conflict":
        return Response.json(
          {
            code: "name_conflict",
            error: "Another pantry item already uses that name.",
            id: outcome.id,
            conflictingItem: toPantryItemResponse(outcome.conflictingItem),
          },
          { status: 409 },
        );
    }
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
