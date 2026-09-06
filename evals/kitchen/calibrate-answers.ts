import { mkdirSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { answerCases } from "./answer-cases";
import { ANSWER_RUBRIC, ANSWER_RUBRIC_VERSION } from "./answer-grader";
import { ANSWER_MODEL, gradeAnswer } from "./grade-answer";
import { EvaluationBudget } from "./budget";
import { evaluationProvenance } from "./provenance";

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("missing_key");
  const directory = ".eval-results/kitchen";
  mkdirSync(directory, { recursive: true });
  const budget = new EvaluationBudget(directory);
  try {
    const api = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 60_000 });
    const version = evaluationProvenance(ANSWER_MODEL);
    const id = new Date().toISOString().replaceAll(":", "-");
    const results: unknown[] = [];
    for (const reference of answerCases) {
      const evaluation = await gradeAnswer(api, budget, reference);
      const { grade } = evaluation;
      const agrees = grade?.verdict === reference.expected;
      results.push({ reference, ...evaluation, agrees });
      // Preserve completed observations even if a later request fails.
      writeFileSync(`${directory}/${id}-answer-calibration.json`, JSON.stringify({ version, rubricVersion: ANSWER_RUBRIC_VERSION, rubric: ANSWER_RUBRIC, budgetChargedUsd: budget.chargedUsd, results }, null, 2));
      console.log(`${reference.id}: ${agrees ? "AGREES" : "DISAGREES"} (${grade?.verdict ?? "ungraded"})`);
      if (!agrees) process.exitCode = 1;
    }
    console.log(`Cumulative budget charged: $${budget.chargedUsd}`);
  } finally { budget.close(); }
}
main().catch(() => { console.error("Answer calibration stopped; retained budget reservations and completed reports. No credentials logged."); process.exitCode = 1; });
