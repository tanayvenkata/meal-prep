import { getConversation, getMessages } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(request);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const conversation = await getConversation(userId, id);
    if (!conversation) return Response.json({ error: "not found" }, { status: 404 });

    const messages = await getMessages(id);
    return Response.json({ conversation, messages });
  } catch (err) {
    console.error(`GET /api/conversations/${id} failed:`, err);
    return Response.json({ error: "failed to fetch conversation" }, { status: 500 });
  }
}
