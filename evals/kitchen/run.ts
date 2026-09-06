import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import type { ResponseInput } from "openai/resources/responses/responses";
import { kitchenFixture, LOCAL_APP_DATABASE } from "./fixture";
import { scenarios, type Scenario } from "./scenarios";
import { EvaluationBudget, REQUEST_RESERVATION_USD } from "./budget";
import { startKitchenTelemetry } from "../../src/lib/telemetry";
import { evaluationProvenance } from "./provenance";
import { gradeAnswer } from "./grade-answer";

const MODEL = "gpt-5.4-mini-2026-03-17";
const MAX_OUTPUT = 2048;
const directory = ".eval-results/kitchen";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  process.env.DATABASE_URL = LOCAL_APP_DATABASE;
  process.env.PROMPTFOO_DISABLE_TELEMETRY = "1";
  mkdirSync(directory, { recursive: true });
  // A process-wide lock protects the cumulative budget across concurrent runs.
  const budget = new EvaluationBudget(directory);
  let telemetry: ReturnType<typeof startKitchenTelemetry> | undefined;
  try {
    const version = evaluationProvenance(MODEL);
    telemetry = startKitchenTelemetry({ release: version.sourceHash });
    const api = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 60_000 });
    const { evaluate } = await import("promptfoo");
    const reportId = new Date().toISOString().replaceAll(":", "-");
    async function run(scenario: Scenario) {
      const kitchen = await kitchenFixture();
      let cost = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let requests = 0;
      const responses: unknown[] = [];
      try {
        for (const item of scenario.seed) {
          const result = await kitchen.call("add_pantry_item", item);
          if (result.isError) throw new Error("Fixture seeding failed");
        }
        const initial = await kitchen.state();
        kitchen.calls.length = 0;
        const catalog = await kitchen.client.listTools();
        const tools = catalog.tools.map(tool => ({ type: "function" as const, name: tool.name, description: tool.description, parameters: tool.inputSchema, strict: false }));
        const instructions = kitchen.client.getInstructions() ?? "";
        const input: ResponseInput = [{ role: "user", content: scenario.prompt }];
        let answer = "";
        let completed = false;
        let error: string | undefined;
        try {
          for (let step = 0; step < 6; step++) {
            const reservation = budget.reserve();
            cost += REQUEST_RESERVATION_USD;
            requests++;
            const response = await api.responses.create({ model: MODEL, instructions, input, tools, store: false, max_output_tokens: MAX_OUTPUT, reasoning: { effort: "low" }, service_tier: "default", parallel_tool_calls: false });
            if (response.usage) {
              const estimate = (response.usage.input_tokens * 0.75 + response.usage.output_tokens * 4.5) / 1_000_000;
              reservation.settle(estimate);
              cost += estimate - REQUEST_RESERVATION_USD;
              inputTokens += response.usage.input_tokens;
              outputTokens += response.usage.output_tokens;
            }
            responses.push({ model: response.model, status: response.status, usage: response.usage, output: response.output });
            for (const item of response.output) {
              if (item.type === "message" || item.type === "function_call" || item.type === "reasoning") input.push(item);
              else throw new Error("Unexpected output type for function-only evaluation");
            }
            const calls = response.output.filter(item => item.type === "function_call");
            if (calls.length === 0) { answer = response.output_text; completed = response.status === "completed"; break; }
            for (const call of calls) {
              if (kitchen.calls.length >= 12) throw new Error("tool_limit");
              const result = await kitchen.call(call.name, JSON.parse(call.arguments));
              input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
            }
          }
        } catch (cause) {
          // Avoid recording SDK errors containing request headers or credentials.
          error = cause instanceof OpenAI.APIError ? `provider_error_${cause.status ?? "connection"}` : "runner_error";
        }
        const final = await kitchen.state();
        const normalized = {
          pantry: final.pantry.map(item => ({ name: String(item.name).toLowerCase(), quantity: item.quantity })).sort((a, b) => a.name.localeCompare(b.name)),
          equipment: final.equipment.map(item => ({ name: String(item.name).toLowerCase(), kind: item.kind })).sort((a, b) => a.name.localeCompare(b.name)),
        };
        const checks = {
          expectedState: JSON.stringify(normalized) === JSON.stringify({ pantry: scenario.pantry, equipment: scenario.equipment }),
          noUnauthorizedWrite: !scenario.forbidWrites || kitchen.calls.every(call => call.name === "get_kitchen_context"),
          stableIdentity: !scenario.preserveIds || JSON.stringify(initial.pantry.map(item => item.id).sort()) === JSON.stringify(final.pantry.map(item => item.id).sort()),
          completed: completed && !error,
        };
        const answerEvaluation = await gradeAnswer(api, budget, {
          prompt: scenario.prompt, initial, final, answer,
          events: kitchen.calls.map(call => JSON.stringify({ tool: call.name, arguments: call.arguments, result: call.result })),
        });
        cost += answerEvaluation.cost;
        requests++;
        inputTokens += answerEvaluation.usage?.input_tokens ?? 0;
        outputTokens += answerEvaluation.usage?.output_tokens ?? 0;
        const statePass = Object.values(checks).every(Boolean);
        const answerPass = answerEvaluation.grade?.verdict === "supported";
        const output = { scenario: scenario.id, checks, statePass, answerPass, answerEvaluation, pass: statePass && answerPass, initial, final, answer, error, calls: kitchen.calls, responses, catalogHash: hash(JSON.stringify(catalog)), instructionsHash: hash(instructions) };
        writeFileSync(`${directory}/${reportId}-${scenario.id}.json`, JSON.stringify({ version, definition: scenario, catalog, instructions, cost, requests, ...output }, null, 2));
        console.log(`${scenario.id}: ${output.pass ? "PASS" : "FAIL"} ($${cost.toFixed(4)})`);
        return { output, cost, tokenUsage: { prompt: inputTokens, completion: outputTokens, total: inputTokens + outputTokens, numRequests: requests } };
      } finally { await kitchen.close(); }
    }
    const selected = process.argv[2] ? scenarios.filter(scenario => scenario.id === process.argv[2]) : scenarios;
    if (!selected.length) throw new Error("Unknown scenario");
    const result = await evaluate({
      description: "Mise local kitchen state baseline v1", writeLatestResults: false,
      prompts: ["{{scenarioId}}"],
      providers: [{ id: () => MODEL, callApi: async (prompt: string) => run(selected.find(scenario => scenario.id === prompt)!) }],
      tests: selected.map(scenario => ({ vars: { scenarioId: scenario.id }, assert: [{ type: "javascript", value: "output.pass === true" }] })),
    }, { maxConcurrency: 1, cache: false });
    const summary = await result.toEvaluateSummary();
    writeFileSync(`${directory}/${reportId}-summary.json`, JSON.stringify({ version, budgetChargedUsd: budget.chargedUsd, summary }, null, 2));
    console.log(JSON.stringify({ results: summary.stats, budgetChargedUsd: budget.chargedUsd, directory }));
    if (summary.stats.failures || summary.stats.errors) process.exitCode = 1;
  } finally { try { await telemetry?.shutdown(); } finally { budget.close(); } }
}

main().then(() => process.exit(process.exitCode ?? 0)).catch(() => { console.error("Kitchen evaluation stopped. Check local setup and retained budget ledger; no credentials were logged."); process.exit(1); });
