// THE BOUNDARY — only file that imports the AI provider SDK. Swap models/providers here.

import { Agent, run, type AgentInputItem } from "@openai/agents";

export const MISE_MODEL = "gpt-5.6-terra";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function toAgentInput(messages: ChatMessage[]): AgentInputItem[] {
  return messages.map(({ role, content }) => {
    if (role === "user") {
      return { role, content: [{ type: "input_text", text: content }] };
    }

    return {
      role,
      status: "completed",
      content: [{ type: "output_text", text: content }],
    };
  });
}

// Streams Mise's reply one text chunk at a time. The route passes trusted kitchen
// context as instructions; chat history stays separate user/assistant input.
export async function* streamChat(
  messages: ChatMessage[],
  instructions?: string,
): AsyncGenerator<string> {
  const mise = new Agent({
    name: "Mise",
    instructions,
    model: MISE_MODEL,
  });
  const stream = await run(mise, toAgentInput(messages), { stream: true });

  for await (const event of stream) {
    if (
      event.type === "raw_model_stream_event" &&
      event.data.type === "output_text_delta"
    ) {
      yield event.data.delta;
    }
  }

  await stream.completed;
}
