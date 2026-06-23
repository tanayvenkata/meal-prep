import { streamChat } from "@/lib/ai";
import { getUserId } from "@/lib/auth";

export async function POST(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { messages } = await request.json();

  if (!messages || messages.length === 0) {
    return new Response("No messages provided", { status: 400 });
  }

  let chunks;
  try {
    chunks = streamChat(messages);
  } catch (err) {
    console.error("POST /api/chat failed:", err);
    return new Response("Failed to start chat", { status: 500 });
  }

  // Created once and reused for every chunk — cheaper than rebuilding it each loop.
  const encoder = new TextEncoder();

    const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        console.error("streaming error:", err);
        controller.error(err); // tell the stream it failed, cleanly
      }
    },
  });


  return new Response(stream);
}