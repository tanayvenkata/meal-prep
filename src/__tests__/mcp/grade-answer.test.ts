import type OpenAI from "openai";
import { expect, it, vi } from "vitest";
import { gradeAnswer } from "../../../evals/kitchen/grade-answer";
import { answerCases } from "../../../evals/kitchen/answer-cases";
import { RunUsage } from "../../../evals/kitchen/usage";
function setup() {
  const usage = new RunUsage();
  const create = vi.fn();
  const api = { responses: { create } } as unknown as OpenAI;
  return { usage, create, api };
}
it("reports known judge usage without a ledger", async () => {
  const { usage, create, api } = setup();
  create.mockResolvedValue({ status: "completed", output_text: '{"verdict":"supported","reason":"Saved"}', usage: { input_tokens: 100, output_tokens: 100 } });
  expect(await gradeAnswer(api, usage, answerCases[0])).toMatchObject({ grade: { verdict: "supported" }, cost: 0.000525 });
  expect(usage.unknownCostRequests).toBe(0);
});
it("marks provider failure cost unknown without leaking diagnostics or retrying", async () => {
  const { usage, create, api } = setup();
  create.mockRejectedValue(new Error("private credential"));
  const result = await gradeAnswer(api, usage, answerCases[0]);
  expect(result).toMatchObject({ status: "grader_error", grade: undefined, cost: null });
  expect(usage.unknownCostRequests).toBe(1);
  expect(JSON.stringify(result)).not.toContain("private credential");
  expect(create).toHaveBeenCalledTimes(1);
});
it("does not treat an incomplete response as a verdict or missing usage as free", async () => {
  const { usage, create, api } = setup();
  create.mockResolvedValue({ status: "incomplete", output_text: '{"verdict":"supported","reason":"Saved"}' });
  expect(await gradeAnswer(api, usage, answerCases[0])).toMatchObject({ grade: undefined, status: "incomplete", cost: null });
  expect(usage.unknownCostRequests).toBe(1);
});
