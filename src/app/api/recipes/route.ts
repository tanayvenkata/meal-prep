import { createClient } from "@supabase/supabase-js";
import { getItems } from "@/lib/db";
import { streamChat } from "@/lib/ai";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

async function getUserId(request: Request): Promise<string | null> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await getSupabase().auth.getUser(token);
  return data.user?.id ?? null;
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { messages } = await req.json();

  const items = await getItems(userId);
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
