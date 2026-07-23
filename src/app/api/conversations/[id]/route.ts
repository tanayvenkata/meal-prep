import { getConversation, getMessages, deleteConversation } from "@/lib/db";
import { getRequestAuth } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (auth.oauthClientId) {
    return Response.json({ error: "oauth client is not permitted" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const conversation = await getConversation(auth.userId, id);
    if (!conversation) return Response.json({ error: "not found" }, { status: 404 });

    const messages = await getMessages(auth.userId, id);
    return Response.json({ conversation, messages });
  } catch (err) {
    console.error(`GET /api/conversations/${id} failed:`, err);
    return Response.json({ error: "failed to fetch conversation" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (auth.oauthClientId) {
    return Response.json({ error: "oauth client is not permitted" }, { status: 403 });
  }

  const { id } = await params;

  try {
    // Scoped to user_id inside the query — deleting a conversation you don't own
    // is a no-op, not an error. Messages cascade via the FK.
    await deleteConversation(auth.userId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error(`DELETE /api/conversations/${id} failed:`, err);
    return Response.json({ error: "failed to delete conversation" }, { status: 500 });
  }
}
