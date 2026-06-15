import { streamChat } from "@/lib/ai";

export async function POST(request: Request) {
  const { messages } = await request.json();
  const chunks = streamChat(messages);

  // Created once and reused for every chunk — cheaper than rebuilding it each loop.
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Loop over chunks, push each into the stream, then close it.
      for await (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream);
}