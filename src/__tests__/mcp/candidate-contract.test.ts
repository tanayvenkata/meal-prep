import { describe, expect, it } from "vitest";
import { candidateInputs } from "../../../evals/kitchen/candidate/contract";
const requestId = "4fbba759-84ba-49e7-80ef-3c72123b4d21";
const wrap = (item: unknown) => ({ requestId, items: [item] });

describe("four-tool candidate intent boundaries", () => {
  it("accepts a named food without inventing quantity", () => {
    expect(candidateInputs.add_items.parse(wrap({ name: "mayo" })).items[0])
      .toEqual({ collection: "pantry", name: "mayo" });
  });
  it("keeps a total replacement distinct from a purchase delta", () => {
    const ref = { collection: "pantry", id: 1, expectedName: "Eggs" };
    expect(candidateInputs.edit_items.safeParse(wrap({ ...ref, operation: "replace", quantity: { amount: "12", unit: "count" } })).success).toBe(true);
    expect(candidateInputs.edit_items.safeParse(wrap({ ...ref, operation: "increase", delta: { amount: "12", unit: "count" } })).success).toBe(false);
    expect(candidateInputs.edit_items.safeParse(wrap({ ...ref, operation: "increase", expectedQuantity: { amount: "4", unit: "count" }, delta: { amount: "12", unit: "count" } })).success).toBe(true);
  });
  it("rejects empty edits, zero deltas and identity injection", () => {
    const ref = { collection: "pantry", id: 1, expectedName: "Eggs" };
    expect(candidateInputs.edit_items.safeParse(wrap({ ...ref, operation: "replace" })).success).toBe(false);
    expect(candidateInputs.edit_items.safeParse(wrap({ ...ref, operation: "decrease", expectedQuantity: { amount: "4", unit: "count" }, delta: { amount: "0", unit: "count" } })).success).toBe(false);
    expect(candidateInputs.add_items.safeParse(wrap({ collection: "pantry", name: "mayo", userId: "someone" })).success).toBe(false);
  });
});
