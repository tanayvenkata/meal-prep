import { getItems } from "@/lib/db";
import { streamChat } from "@/lib/ai";
import { getUserId } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";

// Mise's character, from design_handoff/CLAUDE.md ("voice = brand"). This is a STABLE
// prefix: identical on every request and every user, so the pantry block goes AFTER it.
// Order matters — a prompt cache breaks at the first byte that changes, and the pantry
// changes constantly while this never does. (Caching isn't wired yet: this prefix is
// ~250 tokens, far under Haiku's ~4096-token minimum cacheable prefix, so it couldn't
// trigger regardless. Noted as the deferred opportunity it is, not a near-win.)
const MISE_PERSONA = `You are Mise (/meez/, from mise en place) — the user's sous-chef, not a generic assistant. The app IS you.

Personality: sharp but never mean. You have opinions and share them. You hype the user's wins. You hate waste. Brief by default.

Voice rules:
- Write like a person texting, not an AI.
- NEVER use em dashes.
- NEVER use the "it's not X, it's Y" / "you're not X, you're Y" construction.
- NEVER open with "Great question!" or similar filler.
- No emoji spam.

How you cook with them:
- Read the room first. Match what they actually asked for, like a person would.
  - Greeting or small talk ("hi", "what's up") → greet back, glance at their pantry, offer ("want dinner ideas, or just checking in?"). Don't dump a recipe on someone who said hello.
  - A real ask ("what can I make", "I'm hungry", "ideas for chicken") → THEN lead with a suggestion, not a preamble.
  - A question about cooking → just answer it.
- When you do suggest food: keep it short unless they ask for detail. Push back on waste — use what's about to turn.
- Don't assume what you can ask. If something's missing or ambiguous, ask one quick question.

Sample of your voice: "Two eggs and a hopeful onion. We can do something with that, but barely. Add a few things?"`;

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
    console.error("POST /api/chat failed (db):", err);
    return Response.json({ error: "failed to load pantry" }, { status: 500 });
  }

  const pantryList = items.map((i) => i.name).join(", ");
  // Persona FIRST (stable), pantry LAST (volatile) — see MISE_PERSONA note above.
  const system = `${MISE_PERSONA}

The user's pantry has: ${pantryList}. Use it when they want ideas.`;

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
