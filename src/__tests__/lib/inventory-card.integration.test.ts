import { afterEach, expect, it, vi } from "vitest";
import { kitchenFixture } from "../../../evals/kitchen/fixture";

const fixtures: Awaited<ReturnType<typeof kitchenFixture>>[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
  vi.unstubAllEnvs();
});

it("shows and refreshes only each caller's real saved kitchen without writes", async () => {
  vi.stubEnv("MISE_INVENTORY_UI", "1");
  vi.stubEnv("MISE_TOOL_SURFACE", "four");
  const a = await kitchenFixture(); fixtures.push(a);
  const b = await kitchenFixture(); fixtures.push(b);
  const add = async (kitchen: typeof a, items: unknown[]) => {
    const result = await kitchen.call("add_items", { requestId: crypto.randomUUID(), items });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ status: "applied" });
  };
  await add(a, [{ name: "A rice", quantity: { mode: "text", text: "a little left" } }, { name: "A salt" }, { collection: "equipment", name: "A skillet", kind: "cookware" }]);
  await add(b, [{ name: "B eggs", quantity: { amount: "6", unit: "count" } }]);
  for (const [kitchen, names] of [[a, ["A rice", "A salt"]], [b, ["B eggs"]]] as const) {
    const before = await kitchen.state();
    const card = await kitchen.call("show_kitchen");
    const fresh = await kitchen.call("read_kitchen");
    expect(card.isError).not.toBe(true);
    expect(card.structuredContent).toEqual(fresh.structuredContent);
    const pantry = (card.structuredContent as { pantry: { name: string }[] }).pantry;
    expect(pantry.map(item => item.name).sort()).toEqual([...names].sort());
    expect(await kitchen.state()).toEqual(before);
  }
  const cardA = await a.call("show_kitchen");
  expect(cardA.structuredContent).toMatchObject({ pantry: expect.arrayContaining([
    expect.objectContaining({ name: "A rice", quantityMode: "text", quantity: "a little left" }),
    expect.objectContaining({ name: "A salt", quantityMode: "unknown" }),
  ]), tools: [expect.objectContaining({ name: "A skillet" })] });
  expect((await b.call("show_kitchen")).structuredContent).toMatchObject({ tools: [] });
  await add(a, [{ name: "A milk" }]);
  expect((await a.call("read_kitchen")).structuredContent).toMatchObject({ pantry: expect.arrayContaining([expect.objectContaining({ name: "A milk" })]) });
  expect((await b.call("read_kitchen")).structuredContent).toMatchObject({ pantry: [expect.objectContaining({ name: "B eggs" })] });
});
