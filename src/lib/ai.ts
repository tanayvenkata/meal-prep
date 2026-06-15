// src/lib/ai.ts — THE BOUNDARY.
//
// This is the ONLY file in the whole app that imports the Anthropic SDK.
// Everything else (the API route, and later the UI) talks to Claude through
// the function below — never to the SDK directly. That's the decoupling lesson:
// if we ever swap to OpenRouter or a different model, we change THIS file and
// nothing else.

import Anthropic from "@anthropic-ai/sdk";

// One client for the whole app. With no arguments, the SDK reads the API key
// from the ANTHROPIC_API_KEY environment variable (our .env.local). The key
// never appears in this file — that's deliberate.
const client = new Anthropic();

// Our OWN message shape. The rest of the app speaks this, not the SDK's types.
// It happens to match what the SDK wants, but defining our own is what keeps
// the app decoupled from the SDK.
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// streamChat takes the conversation so far and yields Claude's reply one text
// chunk at a time. The `async function*` (an "async generator") is what lets a
// caller write `for await (const chunk of streamChat(...))` and react to each
// token as it arrives — that's how we get the live "typing" effect.
export async function* streamChat(
  messages: ChatMessage[],
): AsyncGenerator<string> {
  // client.messages.stream() opens a streaming connection to Claude.
  const stream = client.messages.stream({
    model: "claude-sonnet-4-6", // cheap+fast for M1; revisit at M4 for recipe quality
    max_tokens: 4096, // cap on a single reply; plenty for chat, tunable later
    messages,
  });

  // The stream emits many small "events". We only care about the ones that
  // carry a piece of the text reply, so we filter for those and yield the text.
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}
