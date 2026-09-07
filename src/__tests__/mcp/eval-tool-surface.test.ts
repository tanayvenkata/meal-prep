import { afterEach, expect, it, vi } from "vitest";
import { evaluationToolSurface } from "../../../evals/kitchen/tool-surface";

afterEach(() => vi.unstubAllEnvs());

it("defaults to the current four tools and preserves explicit baseline comparisons", () => {
  vi.stubEnv("MISE_TOOL_SURFACE", undefined);
  expect(evaluationToolSurface()).toBe("four");
  vi.stubEnv("MISE_TOOL_SURFACE", "baseline");
  expect(evaluationToolSurface()).toBe("baseline");
  expect(evaluationToolSurface("four")).toBe("four");
  vi.stubEnv("MISE_TOOL_SURFACE", "four");
  expect(evaluationToolSurface("baseline")).toBe("baseline");
});

it.each(["", "Four", "typo"])("rejects invalid surface %j instead of measuring a different catalog", (value) => {
  expect(() => evaluationToolSurface(value)).toThrow("MISE_TOOL_SURFACE must be four or baseline");
});
