import { execFileSync, spawnSync } from "node:child_process";

// Load only the evaluation credential, not the rest of a Doppler environment.
// The runner pins local database connections and the official API endpoint.
try {
  const apiKey = process.env.OPENAI_API_KEY || execFileSync(
    "doppler", ["secrets", "get", "OPENAI_API_KEY", "--plain"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 },
  ).trim();
  if (!apiKey) throw new Error("Missing key");
  const calibrate = process.argv[2] === "--calibrate-answers";
  const entrypoint = calibrate ? "evals/kitchen/calibrate-answers.ts" : "evals/kitchen/run.ts";
  const result = spawnSync(process.execPath, ["--import", "tsx", entrypoint, ...process.argv.slice(calibrate ? 3 : 2)], {
    stdio: "inherit", env: { ...process.env, OPENAI_API_KEY: apiKey, PROMPTFOO_DISABLE_TELEMETRY: "1" },
  });
  process.exitCode = result.status ?? 1;
} catch {
  console.error("Evaluation credential unavailable. Configure OPENAI_API_KEY in your environment or Doppler.");
  process.exitCode = 1;
}
