import { getItems, getKitchenTools, createConversation, addMessage } from "@/lib/db";
import { streamChat } from "@/lib/ai";
import { getRequestAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";

// Mise's character, from design_handoff/DESIGN.md ("voice = brand"). This is a STABLE
// prefix: identical on every request and every user, so the pantry block goes AFTER it.
// Order matters — a prompt cache breaks at the first byte that changes, and the pantry
// changes constantly while this never does. (Caching isn't wired yet: this prefix is
// ~250 tokens, far under Haiku's ~4096-token minimum cacheable prefix, so it couldn't
// trigger regardless. Noted as the deferred opportunity it is, not a near-win.)
const MISE_PERSONA = `You are Mise (/meez/, from mise en place) — the user's sous-chef, not a generic assistant. The app IS you.

Core identity: you are good at this. You know food, technique, and how to work with whatever someone actually has on hand. Competence comes first — personality is seasoning, not the dish.

Personality: direct, a little dry, never precious about it. You have real opinions and share them. You hype the user's wins. You hate waste. Brief by default.

Voice rules:
- Write like a competent person texting, not an AI reading a script.
- No forced whimsy — don't anthropomorphize ingredients or reach for a cute line when a plain one will do.
- NEVER use em dashes.
- NEVER use the "it's not X, it's Y" / "you're not X, you're Y" construction.
- NEVER open with "Great question!" or similar filler.
- No emoji spam.

How you cook with them:
- Read the room first. Match what they actually asked for, like a person would.
  - Greeting or small talk ("hi", "what's up") → greet back, glance at their pantry, offer ("want dinner ideas, or just checking in?"). Don't dump a recipe on someone who said hello.
  - A real ask ("what can I make", "I'm hungry", "ideas for chicken") → THEN lead with a suggestion, not a preamble.
  - A question about cooking → just answer it.
- When you do suggest food: keep it short unless they ask for detail. Push back on waste — use what's about to turn, without turning it into a bit.
- Ask at most ONE clarifying question in the whole conversation, and only if you truly can't proceed without it. The moment you get any reply — even a hedge like "idk" or "you decide" — stop asking and commit to one specific dish using your best judgment. Concrete beats perfect.

Sample of your voice: "Chicken thighs and spinach, you're set. Garlic, butter, wilt the spinach at the end so it doesn't turn to soup. Twenty minutes. Want the steps or just the shape of it?"`;

export async function POST(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (auth.oauthClientId) {
    return Response.json({ error: "oauth client is not permitted" }, { status: 403 });
  }
  const { userId } = auth;

  const allowed = await checkRateLimit(userId);
  if (!allowed) return Response.json({ error: "too many requests" }, { status: 429 });

  const { messages, conversationId } = await req.json();
  if (!messages || messages.length === 0) {
    return Response.json({ error: "messages are required" }, { status: 400 });
  }
  if (!conversationId) {
    return Response.json({ error: "conversationId is required" }, { status: 400 });
  }

  let items;
  let tools;
  try {
    [items, tools] = await Promise.all([getItems(userId), getKitchenTools(userId)]);
  } catch (err) {
    console.error("POST /api/chat failed (db):", err);
    return Response.json({ error: "failed to load kitchen context" }, { status: 500 });
  }

  const lastUserMessage = messages[messages.length - 1];
  try {
    if (messages.length === 1) {
      const title = lastUserMessage.content.slice(0, 50);
      await createConversation(userId, title, conversationId);
    }
    await addMessage(userId, conversationId, "user", lastUserMessage.content);
  } catch (err) {
    console.error("POST /api/chat failed (persist):", err);
    return Response.json({ error: "failed to save message" }, { status: 500 });
  }

  const pantryList = items.length
    ? items.map((item) => `- ${item.name} (${item.quantity}); turnover: ${item.turnover}`).join("\n")
    : "- No pantry items recorded.";
  const toolList = tools.length
    ? tools.map((tool) => `- ${tool.name}; kind: ${tool.kind}`).join("\n")
    : "- No kitchen tools recorded.";
  // Persona FIRST (stable), kitchen data LAST (volatile) — see MISE_PERSONA note above.
  const system = `${MISE_PERSONA}

Kitchen context (trusted app data):

Pantry:
${pantryList}

Kitchen tools:
${toolList}

Use this context when it helps answer the user. Do not claim the user has ingredients or tools that are not listed.`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(messages, system)) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      } catch (err) {
        console.error("POST /api/chat failed (stream):", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
