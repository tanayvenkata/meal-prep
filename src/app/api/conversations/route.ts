import { createConversation, listConversations } from "@/lib/db";
import { getRequestAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (auth.oauthClientId) {
    return Response.json({ error: "oauth client is not permitted" }, { status: 403 });
  }

  try {
    const conversations = await listConversations(auth.userId);
    return Response.json(conversations);
  } catch (err) {
    console.error("GET /api/conversations failed:", err);
    return Response.json({ error: "failed to fetch conversations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (auth.oauthClientId) {
    return Response.json({ error: "oauth client is not permitted" }, { status: 403 });
  }

  const { title, id } = await request.json();
  if (!title || title.trim() === "") {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const conversation = await createConversation(auth.userId, title.trim(), id ?? crypto.randomUUID());
    return Response.json(conversation, { status: 201 });
  } catch (err) {
    console.error("POST /api/conversations failed:", err);
    return Response.json({ error: "failed to create conversation" }, { status: 500 });
  }
}
