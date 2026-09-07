import type { Response, ResponseInput } from "openai/resources/responses/responses";

type ModelTurn = Pick<Response, "output" | "output_text" | "status">;
type Failure = "provider_error" | "incomplete_response" | "unsupported_output" | "model_limit" | "tool_limit";
export type ConversationResult = {
  answer: string;
  completed: boolean;
  error?: Failure;
  modelRequests: number;
  toolAttempts: number;
  observedErrors: Array<"invalid_tool_arguments" | "tool_transport_error">;
};

/** Bounded evaluation host adapter; not a simulation of ChatGPT orchestration. */
export async function runConversation(options: {
  prompt: string;
  followUps?: string[];
  onUserTurnComplete?: (turn: { index: number; prompt: string; answer: string }) => Promise<void>;
  complete: (input: ResponseInput) => Promise<ModelTurn>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxTurns?: number;
  maxTools?: number;
}): Promise<ConversationResult> {
  const input: ResponseInput = [{ role: "user", content: options.prompt }];
  const result: ConversationResult = { answer: "", completed: false, modelRequests: 0, toolAttempts: 0, observedErrors: [] };
  let userTurn = 0;
  const userPrompts = [options.prompt, ...(options.followUps ?? [])];
  const fail = (error: Failure) => ({ ...result, error });
  for (let step = 0; step < (options.maxTurns ?? 6); step++) {
    let response: ModelTurn;
    try { result.modelRequests++; response = await options.complete(input); }
    catch { return fail("provider_error"); }
    if (response.status !== "completed") return fail("incomplete_response");
    for (const item of response.output) {
      if (item.type === "message" || item.type === "function_call" || item.type === "reasoning") input.push(item);
      else return fail("unsupported_output");
    }
    const calls = response.output.filter(item => item.type === "function_call");
    if (!calls.length) {
      result.answer = response.output_text;
      if (!response.output_text.trim()) return { ...result, completed: false };
      await options.onUserTurnComplete?.({ index: userTurn, prompt: userPrompts[userTurn], answer: response.output_text });
      if (userTurn === userPrompts.length - 1) return { ...result, completed: true };
      input.push({ role: "user", content: userPrompts[++userTurn] });
      continue;
    }
    for (const call of calls) {
      if (result.toolAttempts >= (options.maxTools ?? 12)) return fail("tool_limit");
      result.toolAttempts++;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(call.arguments);
        if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error();
      } catch {
        result.observedErrors.push("invalid_tool_arguments");
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ isError: true, error: "invalid_tool_arguments", message: "Arguments must be a JSON object. No tool was invoked." }) });
        continue;
      }
      let output: string;
      try { output = JSON.stringify(await options.callTool(call.name, args)); }
      catch {
        result.observedErrors.push("tool_transport_error");
        output = JSON.stringify({ isError: true, error: "tool_transport_error", message: "The result is unavailable; any write effect is unknown. Read kitchen state before deciding whether to retry." });
      }
      input.push({ type: "function_call_output", call_id: call.call_id, output });
    }
  }
  return fail("model_limit");
}
