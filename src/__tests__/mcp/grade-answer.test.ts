import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type OpenAI from "openai";
import { afterEach, expect, it, vi } from "vitest";
import { gradeAnswer } from "../../../evals/kitchen/grade-answer";
import { answerCases } from "../../../evals/kitchen/answer-cases";
import { EvaluationBudget } from "../../../evals/kitchen/budget";

const directories: string[] = [];
const budgets: EvaluationBudget[] = [];
function setup(chargedUsd = 0) {
  const path = mkdtempSync(join(tmpdir(), "mise-grader-"));
  directories.push(path);
  writeFileSync(join(path, "budget.json"), JSON.stringify({ capUsd: 5, chargedUsd }));
  const budget = new EvaluationBudget(path);
  budgets.push(budget);
  const create = vi.fn();
  const api = { responses: { create } } as unknown as OpenAI;
  return { budget, create, api };
}
afterEach(() => { budgets.splice(0).forEach(b => b.close()); directories.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });

it("reserves judge spend before dispatch and settles known usage", async () => {
  const { budget, create, api } = setup();
  create.mockImplementation(async () => {
    expect(budget.chargedUsd).toBe(0.32);
    return { status: "completed", output_text: '{"verdict":"supported","reason":"Saved"}', usage: { input_tokens: 100, output_tokens: 100 } };
  });
  expect(await gradeAnswer(api, budget, answerCases[0])).toMatchObject({ grade: { verdict: "supported" }, cost: 0.000525 });
  expect(budget.chargedUsd).toBe(0.000525);
});

it("refuses dispatch if the shared ledger has insufficient budget", async () => {
  const { budget, create, api } = setup(4.8);
  await expect(gradeAnswer(api, budget, answerCases[0])).rejects.toThrow("budget_exhausted");
  expect(create).not.toHaveBeenCalled();
});

it("retains uncertain charges and does not expose private provider diagnostics", async () => {
  const { budget, create, api } = setup();
  create.mockRejectedValue(new Error("private credential"));
  const result = await gradeAnswer(api, budget, answerCases[0]);
  expect(result).toMatchObject({ status: "grader_error", grade: undefined, cost: 0.32 });
  expect(budget.chargedUsd).toBe(0.32);
  expect(JSON.stringify(result)).not.toContain("private credential");
  expect(create).toHaveBeenCalledTimes(1);
});

it("does not treat an incomplete response as a verdict", async () => {
  const { budget, create, api } = setup();
  create.mockResolvedValue({ status: "incomplete", output_text: '{"verdict":"supported","reason":"Saved"}' });
  expect(await gradeAnswer(api, budget, answerCases[0])).toMatchObject({ grade: undefined, status: "incomplete" });
  expect(budget.chargedUsd).toBe(0.32);
});
