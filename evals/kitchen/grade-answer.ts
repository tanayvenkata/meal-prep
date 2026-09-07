import type OpenAI from "openai";
import type { RunUsage } from "./usage";
import { ANSWER_RUBRIC, ANSWER_RUBRIC_VERSION, answerGradeFormat, judgeInput, parseAnswerGrade, type AnswerEvidence } from "./answer-grader";

export const ANSWER_MODEL = "gpt-5.4-mini-2026-03-17";
export async function gradeAnswer(api: OpenAI, usage: RunUsage, evidence: AnswerEvidence) {
  const metadata = { model: ANSWER_MODEL, rubricVersion: ANSWER_RUBRIC_VERSION };
  const recordCost = usage.startRequest();
  let cost: number | null = null;
  try {
    const response = await api.responses.create({ model: ANSWER_MODEL, instructions: ANSWER_RUBRIC, input: judgeInput(evidence), store: false, max_output_tokens: 2048, reasoning: { effort: "low" }, service_tier: "default", text: { format: answerGradeFormat } });
    if (response.usage) {
      const estimate = (response.usage.input_tokens * 0.75 + response.usage.output_tokens * 4.5) / 1_000_000;
      recordCost(estimate);
      cost = estimate;
    }
    return { ...metadata, grade: parseAnswerGrade(response.status, response.output_text), status: response.status, usage: response.usage, cost, rawOutput: response.output_text };
  } catch {
    return { ...metadata, grade: undefined, status: "grader_error", usage: undefined, cost };
  }
}
