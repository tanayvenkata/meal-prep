import { expect, it, vi } from "vitest";
import type { Response } from "openai/resources/responses/responses";
import { runConversation } from "../../../evals/kitchen/conversation";
type Turn = Pick<Response, "output" | "output_text" | "status">;
const call = (args = '{}'): Turn => ({ status: "completed", output_text: "", output: [{ type: "function_call", name: "add_pantry_item", call_id: "call-1", arguments: args }] });
const done: Turn = { status: "completed", output_text: "Mayo is saved.", output: [] };

it("returns tool results to the model before accepting its final answer", async () => {
  const complete = vi.fn().mockResolvedValueOnce(call('{"name":"Mayo"}')).mockImplementationOnce(async input => {
    expect(input.at(-1)).toMatchObject({ type: "function_call_output", call_id: "call-1", output: '{"status":"applied"}' });
    return done;
  });
  const callTool = vi.fn().mockResolvedValue({ status: "applied" });
  expect(await runConversation({ prompt: "Add Mayo", complete, callTool })).toMatchObject({ completed: true, modelRequests: 2, toolAttempts: 1 });
  expect(callTool).toHaveBeenCalledWith("add_pantry_item", { name: "Mayo" });
});

it.each(['{', 'null', '[]', '"Mayo"'])("allows argument correction without dispatching malformed input %s", async args => {
  const complete = vi.fn().mockResolvedValueOnce(call(args)).mockResolvedValueOnce(call('{"name":"Mayo"}')).mockResolvedValueOnce(done);
  const callTool = vi.fn().mockResolvedValue({ status: "applied" });
  expect(await runConversation({ prompt: "Add Mayo", complete, callTool })).toMatchObject({ completed: true, toolAttempts: 2, observedErrors: ["invalid_tool_arguments"] });
  expect(callTool).toHaveBeenCalledTimes(1);
});

it("allows recovery from transport failure without claiming the write failed or leaking diagnostics", async () => {
  const complete = vi.fn().mockResolvedValueOnce(call()).mockImplementationOnce(async input => {
    expect(JSON.parse(input.at(-1).output).message).toContain("write effect is unknown");
    expect(JSON.stringify(input)).not.toContain("private credential");
    return { ...done, output_text: "I couldn't confirm the write." };
  });
  const callTool = vi.fn().mockRejectedValue(new Error("private credential"));
  expect(await runConversation({ prompt: "Add Mayo", complete, callTool })).toMatchObject({ completed: true, observedErrors: ["tool_transport_error"] });
  expect(callTool).toHaveBeenCalledTimes(1);
});

it("never executes calls from an incomplete model response", async () => {
  const callTool = vi.fn();
  expect(await runConversation({ prompt: "Add Mayo", complete: vi.fn().mockResolvedValue({ ...call(), status: "incomplete" }), callTool })).toMatchObject({ completed: false, error: "incomplete_response" });
  expect(callTool).not.toHaveBeenCalled();
});

it("bounds model and tool attempts independently", async () => {
  const complete = vi.fn().mockResolvedValue(call());
  const callTool = vi.fn().mockResolvedValue({});
  expect(await runConversation({ prompt: "Add Mayo", complete, callTool, maxTurns: 2 })).toMatchObject({ completed: false, error: "model_limit", modelRequests: 2 });
  callTool.mockClear();
  expect(await runConversation({ prompt: "Add Mayo", complete, callTool, maxTools: 1 })).toMatchObject({ completed: false, error: "tool_limit", toolAttempts: 1 });
  expect(callTool).toHaveBeenCalledTimes(1);
});

it("does not retry provider errors or expose private diagnostics", async () => {
  const complete = vi.fn().mockRejectedValue(new Error("private credential"));
  const result = await runConversation({ prompt: "Add Mayo", complete, callTool: vi.fn() });
  expect(result).toMatchObject({ completed: false, error: "provider_error", modelRequests: 1 });
  expect(JSON.stringify(result)).not.toContain("private credential");
  expect(complete).toHaveBeenCalledTimes(1);
});

const textTurn = (text: string): Turn => ({ status: "completed", output_text: text, output: [{ type: "message", id: "msg-test", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }] });

it("preserves dialogue history and observes state before supplying the next user message", async () => {
  let checkpointObserved = false;
  const complete = vi.fn().mockImplementationOnce(async input => {
    expect(JSON.stringify(input)).not.toContain("Twelve more");
    return textTurn("How many more eggs did you buy?");
  }).mockImplementationOnce(async input => {
    expect(checkpointObserved).toBe(true);
    expect(JSON.stringify(input)).toContain("How many more eggs did you buy?");
    expect(input.at(-1)).toEqual({ role: "user", content: "Twelve more" });
    return textTurn("You bought twelve more eggs.");
  });
  const checkpoint = vi.fn(async () => { checkpointObserved = true; });
  const result = await runConversation({ prompt: "Bought more eggs", followUps: ["Twelve more"], complete, callTool: vi.fn(), onUserTurnComplete: checkpoint });
  expect(result).toMatchObject({ completed: true, modelRequests: 2 });
  expect(checkpoint).toHaveBeenCalledTimes(2);
});

it("keeps the model-request bound across user follow-ups", async () => {
  const complete = vi.fn().mockResolvedValue(textTurn("Please clarify."));
  const result = await runConversation({ prompt: "Start", followUps: ["Second", "Third"], complete, callTool: vi.fn(), maxTurns: 2 });
  expect(result).toMatchObject({ completed: false, error: "model_limit", modelRequests: 2 });
});

it("does not supply a scripted follow-up after an incomplete response", async () => {
  const complete = vi.fn().mockResolvedValue({ ...textTurn("How many?"), status: "incomplete" });
  const checkpoint = vi.fn();
  expect(await runConversation({ prompt: "Bought more", followUps: ["Twelve"], complete, callTool: vi.fn(), onUserTurnComplete: checkpoint })).toMatchObject({ completed: false, error: "incomplete_response" });
  expect(complete).toHaveBeenCalledTimes(1);
  expect(checkpoint).not.toHaveBeenCalled();
});
