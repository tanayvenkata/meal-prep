import { streamChat } from "@/lib/ai";

export async function POST(request: Request) {
    const { messages } = await request.json();

    if (!messages || messages.length === 0) {
      return new Response("No messages provided", { status: 400 });
    }

  const chunks = streamChat(messages);

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