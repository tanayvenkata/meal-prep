import { getConversation, addMessage } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { role, content } = await request.json();
  if (!role || !content) {
    return Response.json({ error: "role and content are required" }, { status: 400 });
  }
  if (role !== "user" && role !== "assistant") {
    return Response.json({ error: "role must be user or assistant" }, { status: 400 });
  }

  const { id } = await params;

  try {
    const conversation = await getConversation(userId, id);
    if (!conversation) return Response.json({ error: "not found" }, { status: 404 });

    const message = await addMessage(userId, id, role, content);
    return Response.json(message, { status: 201 });
  } catch (err) {
    console.error(`POST /api/conversations/${id}/messages failed:`, err);
    return Response.json({ error: "failed to save message" }, { status: 500 });
  }
}
