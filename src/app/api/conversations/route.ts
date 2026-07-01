import { createConversation, listConversations } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function GET(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const conversations = await listConversations(userId);
    return Response.json(conversations);
  } catch (err) {
    console.error("GET /api/conversations failed:", err);
    return Response.json({ error: "failed to fetch conversations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { title, id } = await request.json();
  if (!title || title.trim() === "") {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const conversation = await createConversation(userId, title.trim(), id ?? crypto.randomUUID());
    return Response.json(conversation, { status: 201 });
  } catch (err) {
    console.error("POST /api/conversations failed:", err);
    return Response.json({ error: "failed to create conversation" }, { status: 500 });
  }
}
