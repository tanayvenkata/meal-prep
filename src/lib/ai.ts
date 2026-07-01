// THE BOUNDARY — only file that imports the Anthropic SDK. Swap models/providers here.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Streams Claude's reply one text chunk at a time. Pass an optional system prompt
// to give Claude context (e.g. the user's pantry) without exposing it in the chat.
export async function* streamChat(
  messages: ChatMessage[],
  system?: string,
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    messages,
    ...(system ? { system } : {}),
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}
