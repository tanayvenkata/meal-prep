import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kitchenFixture } from "../../../evals/kitchen/fixture";

describe("kitchen writes through a real MCP client and local Postgres", () => {
  let kitchen: Awaited<ReturnType<typeof kitchenFixture>>;
  beforeEach(async () => { kitchen = await kitchenFixture(); });
  afterEach(async () => { await kitchen?.close(); });

  it("adds Mayo without inventing a quantity", async () => {
    const result = await kitchen.call("add_pantry_item", { name: "Mayo" });
    expect(result.isError).not.toBe(true);
    expect((await kitchen.state()).pantry).toMatchObject([{ name: "Mayo", quantity: "", quantity_value: null }]);
    expect((await kitchen.call("get_kitchen_context")).isError).not.toBe(true);
  });

  it("repeating an add after a lost response does not duplicate Mayo", async () => {
    await kitchen.call("add_pantry_item", { name: "Mayo" });
    await kitchen.call("add_pantry_item", { name: "Mayo" });
    expect((await kitchen.state()).pantry).toHaveLength(1);
  });

  it("renames an item using its stable identity", async () => {
    await kitchen.call("add_pantry_item", { name: "Mayo" });
    const { pantry: [item] } = await kitchen.state();
    const result = await kitchen.call("update_pantry_item", { id: Number(item.id), expectedName: "Mayo", name: "Mayonnaise" });
    expect(result.isError).not.toBe(true);
    expect((await kitchen.state()).pantry).toMatchObject([{ id: item.id, name: "Mayonnaise" }]);
  });

  it("rejects a stale rename without changing the database", async () => {
    await kitchen.call("add_pantry_item", { name: "Mayo" });
    const before = await kitchen.state();
    const result = await kitchen.call("update_pantry_item", { id: Number(before.pantry[0].id), expectedName: "Old mayo", name: "Mustard" });
    expect(result.structuredContent).toMatchObject({ status: "conflict" });
    expect(await kitchen.state()).toEqual(before);
  });

  it("records an explicit half jar", async () => {
    await kitchen.call("add_pantry_item", { name: "Mayo", quantity: { amount: "0.5", unit: "jar" } });
    expect((await kitchen.state()).pantry).toMatchObject([{ name: "Mayo", quantity: "0.5 jar" }]);
  });

  it("consumes two eggs once despite an immediate identical retry", async () => {
    await kitchen.call("add_pantry_item", { name: "Eggs", quantity: { amount: "6", unit: "count" } });
    const args = { name: "Eggs", expectedQuantity: { amount: "6", unit: "count" }, deltaQuantity: { amount: "2", unit: "count" } };
    expect((await kitchen.call("consume_pantry_item", args)).structuredContent).toMatchObject({ outcome: { status: "applied" } });
    expect((await kitchen.call("consume_pantry_item", args)).structuredContent).toMatchObject({ outcome: { status: "conflict" } });
    expect((await kitchen.state()).pantry).toMatchObject([{ name: "Eggs", quantity: "4" }]);
  });

  it("rejects invalid input without a write", async () => {
    const result = await kitchen.call("add_pantry_item", { name: "Mayo", quantity: { amount: "a bit", unit: "jar" } });
    expect(result.isError).toBe(true);
    expect((await kitchen.state()).pantry).toEqual([]);
  });

  it("adds and reads equipment", async () => {
    const result = await kitchen.call("add_kitchen_tool", { name: "Skillet", kind: "cookware" });
    expect(result.isError).not.toBe(true);
    expect((await kitchen.state()).equipment).toMatchObject([{ name: "Skillet", kind: "cookware" }]);
    expect((await kitchen.call("get_kitchen_context")).isError).not.toBe(true);
  });

  it("does not partially apply a batch with a missing item", async () => {
    await kitchen.call("add_pantry_item", { name: "Eggs", quantity: { amount: "6", unit: "count" } });
    const before = await kitchen.state();
    const result = await kitchen.call("apply_pantry_adjustments", { changes: ["Eggs", "Missing"].map(name => ({ name, operation: "consume", expectedQuantity: { amount: "6", unit: "count" }, deltaQuantity: { amount: "2", unit: "count" } })) });
    expect(result.structuredContent).toMatchObject({ outcome: { status: "rejected", failures: [{ name: "Missing", status: "not_found" }] } });
    expect(await kitchen.state()).toEqual(before);
  });

  it("reading kitchen context for planning has no side effects", async () => {
    await kitchen.call("add_pantry_item", { name: "Rice" });
    const before = await kitchen.state();
    await kitchen.call("get_kitchen_context");
    await kitchen.call("get_kitchen_context");
    expect(await kitchen.state()).toEqual(before);
  });

  it("preserves a descriptive quantity without fabricating a number", async () => {
    const result = await kitchen.call("add_pantry_item", { name: "Rice", quantity: { mode: "text", text: "a little left" } });
    expect(result.isError).not.toBe(true);
    expect((await kitchen.state()).pantry).toMatchObject([{ name: "Rice", quantity: "a little left", quantity_value: null }]);
  });

  it("clears a quantity while preserving the same pantry item", async () => {
    await kitchen.call("add_pantry_item", { name: "Mayo", quantity: { amount: "1", unit: "jar" } });
    const { pantry: [item] } = await kitchen.state();
    const result = await kitchen.call("update_pantry_item", { id: Number(item.id), expectedName: "Mayo", quantity: { mode: "unknown" } });
    expect(result.structuredContent).toMatchObject({ status: "updated" });
    expect((await kitchen.state()).pantry).toMatchObject([{ id: item.id, name: "Mayo", quantity: "", quantity_value: null }]);
  });
});
