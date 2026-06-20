// src/app/api/pantry/route.ts — the thin HANDLER.
//
// Same shape as chat/route.ts: it imports the real work from the lib boundary
// (db.ts) and just handles the HTTP part — receive request, call the lib, return
// a response. The SQL lives in db.ts; this file only deals with HTTP.

import { getItems, addItem, updateItem, deleteItem } from "@/lib/db";

// GET /api/pantry — READ. Returns the full pantry as JSON.
// HTTP method GET maps to CRUD's "Read", exactly as you predicted.
export async function GET() {
  const items = await getItems();
  return Response.json(items);
}

// POST /api/pantry — CREATE. Body: { name, quantity }. Returns the new item.
export async function POST(request: Request) {
  const { name, quantity } = await request.json();

  // BACKEND validation — re-checked here even though the frontend also checks,
  // because the frontend can be bypassed (curl hits this directly). The backend
  // is the only place we can actually trust.
  if (!name || name.trim() === "") {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const item = await addItem(name.trim(), (quantity ?? "").trim());
  return Response.json(item, { status: 201 }); // 201 = "Created"
}

// PUT /api/pantry — UPDATE. Body: { id, quantity }. Returns the updated item.
export async function PUT(request: Request) {
  const { id, quantity } = await request.json();

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const item = await updateItem(id, (quantity ?? "").trim());
  return Response.json(item);
}

// DELETE /api/pantry — DELETE. Body: { id }. Returns success.
export async function DELETE(request: Request) {
  const { id } = await request.json();

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  await deleteItem(id);
  return Response.json({ success: true });
}
