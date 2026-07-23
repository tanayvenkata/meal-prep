import { getItems, addItem, updateItem, deleteItem, type Turnover } from "@/lib/db";
import { getRequestAuth } from "@/lib/auth";

const MAX_NAME_LENGTH = 100;

// Returns the cleaned name, or an error message. The route is the trust
// boundary: never rely on the browser form having validated anything.
function validateName(name: unknown): { name: string } | { error: string } {
  if (typeof name !== "string" || name.trim() === "") {
    return { error: "name is required" };
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { error: `name must be ${MAX_NAME_LENGTH} characters or fewer` };
  }
  return { name: trimmed };
}

function validateTurnover(turnover: unknown): { turnover: Turnover } | { error: string } {
  if (turnover === "high" || turnover === "low") return { turnover };
  return { error: "turnover must be high or low" };
}

export async function GET(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const items = await getItems(auth.userId);
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

  const { name, quantity, turnover = "high" } = await request.json();
  const validated = validateName(name);
  if ("error" in validated) {
    return Response.json({ error: validated.error }, { status: 400 });
  }
  const validatedTurnover = validateTurnover(turnover);
  if ("error" in validatedTurnover) {
    return Response.json({ error: validatedTurnover.error }, { status: 400 });
  }

  try {
    const item = await addItem(auth.userId, validated.name, (quantity ?? "").trim(), validatedTurnover.turnover);
    return Response.json(item, { status: 201 });
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

  const { id, quantity, name, turnover } = await request.json();
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  // name is optional on update — but if the client sends one, it must be valid.
  let validatedName: string | undefined;
  if (name !== undefined && name !== null) {
    const validated = validateName(name);
    if ("error" in validated) {
      return Response.json({ error: validated.error }, { status: 400 });
    }
    validatedName = validated.name;
  }

  let validatedTurnover: Turnover | undefined;
  if (turnover !== undefined && turnover !== null) {
    const validated = validateTurnover(turnover);
    if ("error" in validated) {
      return Response.json({ error: validated.error }, { status: 400 });
    }
    validatedTurnover = validated.turnover;
  }

  try {
    const item = await updateItem(auth.userId, id, (quantity ?? "").trim(), validatedName, validatedTurnover);
    return Response.json(item);
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

  const { id } = await request.json();
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  try {
    await deleteItem(auth.userId, id);
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/pantry failed:", err);
    return Response.json({ error: "failed to delete item" }, { status: 500 });
  }
}
