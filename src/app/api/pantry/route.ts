import { createClient } from "@supabase/supabase-js";
import { getItems, addItem, updateItem, deleteItem } from "@/lib/db";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

// Extracts and verifies the JWT from the Authorization header.
// Returns the user_id string, or null if missing/invalid.
async function getUserId(request: Request): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await getSupabase().auth.getUser(token);
  return data.user?.id ?? null;
}

export async function GET(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const items = await getItems(userId);
  return Response.json(items);
}

export async function POST(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { name, quantity } = await request.json();
  if (!name || name.trim() === "") {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const item = await addItem(userId, name.trim(), (quantity ?? "").trim());
  return Response.json(item, { status: 201 });
}

export async function PUT(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id, quantity } = await request.json();
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const item = await updateItem(userId, id, (quantity ?? "").trim());
  return Response.json(item);
}

export async function DELETE(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  await deleteItem(userId, id);
  return Response.json({ success: true });
}
