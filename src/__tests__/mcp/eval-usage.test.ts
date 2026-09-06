import { expect, it } from "vitest";
import { RunUsage } from "../../../evals/kitchen/usage";
it("reports costs above the former cap without blocking", () => {
  const usage = new RunUsage();
  usage.startRequest()(6);
  expect(usage.knownCostUsd).toBe(6);
  expect(usage.unknownCostRequests).toBe(0);
});
it("keeps missing or invalid usage unknown", () => {
  const usage = new RunUsage();
  const record = usage.startRequest();
  expect(() => record(NaN)).toThrow();
  expect(usage.unknownCostRequests).toBe(1);
  record(0.1);
  expect(() => record(0.1)).toThrow();
  expect(usage.knownCostUsd).toBe(0.1);
});
