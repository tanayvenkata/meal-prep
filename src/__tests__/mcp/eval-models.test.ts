import { describe, expect, it } from "vitest";
import { actorModel, actorUsageCost } from "../../../evals/kitchen/models";

describe("evaluation model pricing", () => {
  it("uses the requested Luna actor and rejects unpriced models", () => {
    expect(actorModel()).toBe("gpt-5.6-luna");
    expect(() => actorModel("unpriced-model")).toThrow();
    expect(() => actorModel("__proto__")).toThrow();
  });
  it("accounts for Luna cache reads and writes separately", () => {
    expect(actorUsageCost("gpt-5.6-luna", { input_tokens: 10000, output_tokens: 1000, input_tokens_details: { cached_tokens: 2000, cache_write_tokens: 3000 } })).toBeCloseTo(0.00299);
  });
  it("charges missing cache-write detail conservatively", () => {
    expect(actorUsageCost("gpt-5.6-luna", { input_tokens: 10000, output_tokens: 1000 })).toBeCloseTo(0.0037);
  });
  it("applies long-context rates to the whole request", () => {
    expect(actorUsageCost("gpt-5.6-luna", { input_tokens: 300000, output_tokens: 1000, input_tokens_details: { cache_write_tokens: 0 } })).toBeCloseTo(0.1218);
  });
  it("rejects impossible cache usage instead of refunding an unknown charge", () => {
    expect(() => actorUsageCost("gpt-5.6-luna", { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 101 } })).toThrow();
  });
});
