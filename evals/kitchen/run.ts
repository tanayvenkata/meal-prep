import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { runConversation } from "./conversation";
import { kitchenFixture, LOCAL_APP_DATABASE } from "./fixture";
import { scenarios, recoveryScenarios, validationScenarios, everydayScenarios, dialogueScenarios, compositionScenarios, rolloutScenarios, type Scenario } from "./scenarios";
import { RunUsage } from "./usage";
import { startKitchenTelemetry } from "../../src/lib/telemetry";
import { evaluationProvenance } from "./provenance";
import { gradeAnswer } from "./grade-answer";

import { actorModel, actorUsageCost } from "./models";

const surface = process.env.MISE_TOOL_SURFACE === "four" ? "four" : "baseline";
const readTool = surface === "four" ? "read_kitchen" : "get_kitchen_context";
const addTool = surface === "four" ? "add_items" : "add_pantry_item";
const MODEL = actorModel(process.env.KITCHEN_EVAL_MODEL);
const MAX_OUTPUT = 2048;
const directory = ".eval-results/kitchen";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  process.env.DATABASE_URL = LOCAL_APP_DATABASE;
  process.env.PROMPTFOO_DISABLE_TELEMETRY = "1";
  mkdirSync(directory, { recursive: true });
  const usage = new RunUsage();
  let telemetry: ReturnType<typeof startKitchenTelemetry> | undefined;
  try {
    const version = { ...evaluationProvenance(MODEL), toolSurface: surface };
    telemetry = startKitchenTelemetry({ release: version.sourceHash });
    const api = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 60_000 });
    const { evaluate } = await import("promptfoo");
    const reportId = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
    const outcomes: Array<{ scenario: string; taskSuccess: boolean; safeFailure: boolean; acceptancePass: boolean }> = [];
    async function run(scenario: Scenario) {
      let unavailableAttempts = 0;
      const kitchen = await kitchenFixture(scenario.fault === "create_unavailable" ? {
        addItems: async () => { unavailableAttempts++; throw new Error("synthetic_dependency_failure"); },
        createPantryItem: async () => { unavailableAttempts++; throw new Error("synthetic_dependency_failure"); },
      } : {});
      let cost = 0;
      const unknownBefore = usage.unknownCostRequests;
      let inputTokens = 0;
      let outputTokens = 0;
      let requests = 0;
      const responses: unknown[] = [];
      try {
        for (const item of scenario.seed) {
          const result = await kitchen.call(addTool, surface === "four" ? { requestId: randomUUID(), items: [{ collection: "pantry", ...item }] } : item);
          if (result.isError) throw new Error("Fixture seeding failed");
        }
        const initial = await kitchen.state();
        kitchen.calls.length = 0;
        const catalog = await kitchen.client.listTools();
        const tools = catalog.tools.map(tool => ({ type: "function" as const, name: tool.name, description: tool.description, parameters: tool.inputSchema, strict: false }));
        const instructions = kitchen.client.getInstructions() ?? "";
        let lostResponseAt: number | undefined;
        const turns: Array<{ index: number; prompt: string; answer: string; state: Awaited<ReturnType<typeof kitchen.state>>; calls: typeof kitchen.calls; statePass: boolean; noUnauthorizedWrite: boolean }> = [];
        let priorCallCount = 0;
        const actorStartedAt = performance.now();
        const conversation = await runConversation({
          prompt: scenario.prompt,
          followUps: scenario.followUps,
          maxTurns: scenario.maxModelRequests,
          onUserTurnComplete: async turn => {
            if (!scenario.followUps) return;
            const state = await kitchen.state();
            const calls = kitchen.calls.slice(priorCallCount);
            priorCallCount = kitchen.calls.length;
            const expected = scenario.checkpoints?.[turn.index];
            const pantry = state.pantry.map(item => ({ name: String(item.name).toLowerCase(), quantity: item.quantity })).sort((a, b) => a.name.localeCompare(b.name));
            turns.push({ ...turn, state, calls,
              statePass: !!expected && JSON.stringify(pantry) === JSON.stringify(expected.pantry) && (expected.equipment ? JSON.stringify(state.equipment.map(item => ({ name: String(item.name).toLowerCase(), kind: item.kind })).sort((a, b) => a.name.localeCompare(b.name))) === JSON.stringify(expected.equipment) : JSON.stringify(state.equipment) === JSON.stringify(initial.equipment)),
              noUnauthorizedWrite: !expected?.forbidWrites || calls.every(call => call.name === readTool),
            });
          },
          callTool: async (name, args) => {
            const result = await kitchen.call(name, args);
            if (scenario.fault === "lose_add_response" && lostResponseAt === undefined && name === addTool && !result.isError) {
              lostResponseAt = kitchen.calls.length - 1;
              throw new Error("synthetic_lost_response");
            }
            return result;
          },
          complete: async input => {
            const recordCost = usage.startRequest();
            requests++;
            const response = await api.responses.create({ model: MODEL, instructions, input, tools, store: false, max_output_tokens: MAX_OUTPUT, reasoning: { effort: "low" }, service_tier: "default", parallel_tool_calls: false });
            if (response.usage) {
              const estimate = actorUsageCost(MODEL, response.usage);
              recordCost(estimate);
              cost += estimate;
              inputTokens += response.usage.input_tokens;
              outputTokens += response.usage.output_tokens;
            }
            responses.push({ model: response.model, status: response.status, usage: response.usage, output: response.output });
            return response;
          },
        });
        const actorDurationMs = performance.now() - actorStartedAt;
        const actorCostUsd = usage.unknownCostRequests === unknownBefore ? cost : null;
        const { answer, completed, error } = conversation;
        const final = await kitchen.state();
        const normalized = {
          pantry: final.pantry.map(item => ({ name: String(item.name).toLowerCase(), quantity: item.quantity })).sort((a, b) => a.name.localeCompare(b.name)),
          equipment: final.equipment.map(item => ({ name: String(item.name).toLowerCase(), kind: item.kind })).sort((a, b) => a.name.localeCompare(b.name)),
        };
        const checks = {
          expectedState: JSON.stringify(normalized) === JSON.stringify({ pantry: scenario.pantry, equipment: scenario.equipment }),
          noUnauthorizedWrite: !scenario.forbidWrites || kitchen.calls.every(call => call.name === readTool),
          stableIdentity: !scenario.preserveIds || JSON.stringify(initial.pantry.map(item => item.id).sort()) === JSON.stringify(final.pantry.map(item => item.id).sort()),
          completed: completed && !error,
          intermediateStates: !scenario.followUps || (turns.length === scenario.followUps.length + 1 && turns.every(turn => turn.statePass && turn.noUnauthorizedWrite)),
        };
        const answerEvaluation = await gradeAnswer(api, usage, {
          prompt: [scenario.prompt, ...(scenario.followUps ?? [])].join("\nNext user turn: "), initial, final, answer: turns.length ? turns.map(turn => `Assistant turn ${turn.index + 1}: ${turn.answer}`).join("\n") : answer,
          events: turns.length ? turns.map(turn => JSON.stringify(turn)) : kitchen.calls.map((call, index) => JSON.stringify({ tool: call.name, arguments: call.arguments, serverResult: call.result,
            assistantObservation: index === lostResponseAt ? "Successful result withheld. Assistant received effect-unknown transport error." : call.result })),
        });
        cost += answerEvaluation.cost ?? 0;
        requests++;
        inputTokens += answerEvaluation.usage?.input_tokens ?? 0;
        outputTokens += answerEvaluation.usage?.output_tokens ?? 0;
        const statePass = Object.values(checks).every(Boolean);
        const answerPass = answerEvaluation.grade?.verdict === "supported";
        const faultExercised = scenario.fault === "lose_add_response" ? lostResponseAt !== undefined : scenario.fault === "create_unavailable" ? unavailableAttempts > 0 : true;
        const recoveryRead = scenario.fault !== "lose_add_response" || (lostResponseAt !== undefined && kitchen.calls[lostResponseAt + 1]?.name === readTool);
        const taskSuccess = statePass && answerPass;
        const safeFailure = !checks.expectedState && JSON.stringify(initial) === JSON.stringify(final) && completed && !error && answerPass && faultExercised;
        const acceptancePass = (scenario.expectedOutcome === "safe_failure" ? safeFailure : taskSuccess) && faultExercised && recoveryRead;
        const unknownCostRequests = usage.unknownCostRequests - unknownBefore;
        const output = { scenario: scenario.id, knownCostUsd: cost, unknownCostRequests, turns, actorDurationMs, actorCostUsd, actorModel: MODEL, checks, statePass, answerPass, answerEvaluation, taskSuccess, safeFailure, acceptancePass, faultExercised, recoveryRead, lostResponseAt, unavailableAttempts, conversation, pass: taskSuccess, initial, final, answer, error, calls: kitchen.calls, responses, catalogHash: hash(JSON.stringify(catalog)), instructionsHash: hash(instructions) };
        outcomes.push({ scenario: scenario.id, taskSuccess, safeFailure, acceptancePass });
        writeFileSync(`${directory}/${reportId}-${scenario.id}.json`, JSON.stringify({ version, definition: scenario, catalog, instructions, cost: unknownCostRequests ? null : cost, requests, ...output }, null, 2));
        console.log(`${scenario.id}: ${acceptancePass ? (taskSuccess ? "TASK_PASS" : "SAFE_FAILURE") : "FAIL"} ($${cost.toFixed(4)} known${unknownCostRequests ? ", incomplete usage" : ""})`);
        return { output, ...(unknownCostRequests ? {} : { cost }), tokenUsage: { prompt: inputTokens, completion: outputTokens, total: inputTokens + outputTokens, numRequests: requests } };
      } finally { await kitchen.close(); }
    }
    const allScenarios = [...scenarios, ...recoveryScenarios, ...validationScenarios, ...everydayScenarios, ...dialogueScenarios];
    const selected = process.argv[2] === "--rollout" ? rolloutScenarios : process.argv[2] === "--composition" ? compositionScenarios : process.argv[2] === "--workflows" ? allScenarios.filter(scenario => !scenario.fault) : process.argv[2] === "--dialogue" ? dialogueScenarios : process.argv[2] === "--everyday" ? everydayScenarios : process.argv[2] === "--recovery" ? recoveryScenarios : process.argv[2] === "--validation" ? validationScenarios : process.argv[2] === "--all" ? allScenarios : process.argv[2] ? allScenarios.filter(scenario => scenario.id === process.argv[2]) : scenarios;
    if (!selected.length) throw new Error("Unknown scenario");
    const result = await evaluate({
      description: "Mise local kitchen state baseline v1", writeLatestResults: false,
      prompts: ["{{scenarioId}}"],
      providers: [{ id: () => MODEL, callApi: async (prompt: string) => run(selected.find(scenario => scenario.id === prompt)!) }],
      tests: selected.map(scenario => ({ vars: { scenarioId: scenario.id }, assert: [{ type: "javascript", value: "output.acceptancePass === true" }] })),
    }, { maxConcurrency: 1, cache: false });
    const summary = await result.toEvaluateSummary();
    const taskMetrics = { evaluated: outcomes.length, taskSuccesses: outcomes.filter(o => o.taskSuccess).length, safeFailures: outcomes.filter(o => o.safeFailure).length, accepted: outcomes.filter(o => o.acceptancePass).length };
    writeFileSync(`${directory}/${reportId}-summary.json`, JSON.stringify({ version, knownCostUsd: usage.knownCostUsd, unknownCostRequests: usage.unknownCostRequests, taskMetrics, outcomes, summary }, null, 2));
    console.log(JSON.stringify({ results: summary.stats, taskMetrics, knownCostUsd: usage.knownCostUsd, unknownCostRequests: usage.unknownCostRequests, directory }));
    if (summary.stats.failures || summary.stats.errors) process.exitCode = 1;
  } finally { await telemetry?.shutdown(); }
}

main().then(() => process.exit(process.exitCode ?? 0)).catch(() => { console.error("Kitchen evaluation stopped. Check local setup and per-run reports; no credentials were logged."); process.exit(1); });
