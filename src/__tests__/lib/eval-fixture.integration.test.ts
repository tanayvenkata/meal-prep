import { afterEach, expect, it, vi } from "vitest";
import { kitchenFixture } from "../../../evals/kitchen/fixture";

afterEach(() => vi.unstubAllEnvs());

it.each([
  [undefined, undefined, 4, "add_items"],
  ["baseline", undefined, 12, "add_pantry_item"],
  ["four", "baseline", 12, "add_pantry_item"],
] as const)("serves the selected evaluation catalog (env=%s, override=%s)", async (env, override, count, addTool) => {
  vi.stubEnv("MISE_TOOL_SURFACE", env);
  const fixture = await kitchenFixture(override ? { toolSurface: override } : {});
  try {
    const { tools } = await fixture.client.listTools();
    expect(tools).toHaveLength(count);
    expect(tools.map(tool => tool.name)).toContain(addTool);
    expect(await fixture.state()).toEqual({ pantry: [], equipment: [] });
  } finally {
    await fixture.close();
  }
});
