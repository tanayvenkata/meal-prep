import { getItems } from "@/lib/db";
import { streamChat } from "@/lib/ai";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const items = await getItems();
  const pantryList = items.map((i) => i.name).join(", ");
  const system = `You are a helpful cooking assistant. The user has these ingredients in their pantry: ${pantryList}. Suggest recipes based on what they have.`;

  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of streamChat(messages, system)) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
