import {
  addKitchenTool,
  deleteKitchenTool,
  getKitchenTools,
  updateKitchenTool,
} from "@/lib/db";
import { getRequestAuth } from "@/lib/auth";

const MAX_NAME_LENGTH = 100;
const MAX_KIND_LENGTH = 50;

function validateText(value: unknown, field: "name" | "kind", maxLength: number): { value: string } | { error: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return { error: `${field} is required` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { error: `${field} must be ${maxLength} characters or fewer` };
  }
  return { value: trimmed };
}

export async function GET(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    return Response.json(await getKitchenTools(auth.userId));
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

  const { name, kind } = await request.json();
  const validName = validateText(name, "name", MAX_NAME_LENGTH);
  const validKind = validateText(kind, "kind", MAX_KIND_LENGTH);
  if ("error" in validName) return Response.json({ error: validName.error }, { status: 400 });
  if ("error" in validKind) return Response.json({ error: validKind.error }, { status: 400 });

  try {
    return Response.json(await addKitchenTool(auth.userId, validName.value, validKind.value), { status: 201 });
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

  const { id, name, kind } = await request.json();
  if (typeof id !== "string" || id === "") {
    return Response.json({ error: "id is required" }, { status: 400 });
  }
  const validName = validateText(name, "name", MAX_NAME_LENGTH);
  const validKind = validateText(kind, "kind", MAX_KIND_LENGTH);
  if ("error" in validName) return Response.json({ error: validName.error }, { status: 400 });
  if ("error" in validKind) return Response.json({ error: validKind.error }, { status: 400 });

  try {
    return Response.json(await updateKitchenTool(auth.userId, id, validName.value, validKind.value));
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

  const { id } = await request.json();
  if (typeof id !== "string" || id === "") {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteKitchenTool(auth.userId, id);
    return Response.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/tools failed:", err);
    return Response.json({ error: "failed to delete kitchen tool" }, { status: 500 });
  }
}
