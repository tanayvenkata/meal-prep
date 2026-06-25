import { getItems } from "@/lib/db";
import { streamChat } from "@/lib/ai";
import { getUserId } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const allowed = await checkRateLimit(userId);
  if (!allowed) return Response.json({ error: "too many requests" }, { status: 429 });

  const { messages } = await req.json();
  if (!messages || messages.length === 0) {
    return Response.json({ error: "messages are required" }, { status: 400 });
  }

  let items;
  try {
    items = await getItems(userId);
  } catch (err) {
    console.error("POST /api/recipes failed (db):", err);
    return Response.json({ error: "failed to load pantry" }, { status: 500 });
  }

  const pantryList = items.map((i) => i.name).join(", ");
  const system = `You are a helpful cooking assistant. The user has these ingredients in their pantry: ${pantryList}. Suggest recipes based on what they have.`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(messages, system)) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      } catch (err) {
        console.error("POST /api/recipes failed (stream):", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
