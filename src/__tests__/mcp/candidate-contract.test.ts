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

describe("voice mode speech summaries for mutations", () => {
  it("generates natural spoken confirmation for single item addition", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "add_items",
      { items: [{ name: "Olive oil", collection: "pantry" }] },
      { status: "applied", replayed: false, results: [] },
    );
    expect(summary).toBe("Added Olive oil to your kitchen.");
  });

  it("generates natural spoken confirmation for multiple item additions", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "add_items",
      {
        items: [
          { name: "Eggs", collection: "pantry" },
          { name: "Milk", collection: "pantry" },
          { name: "Butter", collection: "pantry" },
        ],
      },
      { status: "applied", replayed: false, results: [] },
    );
    expect(summary).toBe("Added 3 items to your kitchen: Eggs, Milk, Butter.");
  });

  it("generates natural spoken confirmation for single item edit", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "edit_items",
      { items: [{ id: 1, expectedName: "Olive oil", operation: "replace" }] },
      { status: "applied", replayed: false, results: [] },
    );
    expect(summary).toBe("Updated Olive oil in your kitchen.");
  });

  it("generates natural spoken confirmation for single item removal", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "remove_items",
      { items: [{ id: 2, expectedName: "Cumin", collection: "pantry" }] },
      { status: "applied", replayed: false, results: [] },
    );
    expect(summary).toBe("Removed Cumin from your kitchen.");
  });

  it("handles multiple item removals with clean pluralization", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "remove_items",
      { items: [{ expectedName: "Salt" }, { expectedName: "Sugar" }] },
      { status: "applied", replayed: false, results: [] },
    );
    expect(summary).toBe("Removed 2 items from your kitchen: Salt, Sugar.");
  });

  it("handles replayed requests gracefully without claiming new mutations", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "add_items",
      { items: [{ name: "Eggs" }] },
      { status: "applied", replayed: true, results: [] },
    );
    expect(summary).toContain("already applied earlier without changing your kitchen again");
  });

  it("handles rejection due to conflict clearly without raw json brackets", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "edit_items",
      { items: [{ id: 1, expectedName: "Milk" }] },
      { status: "rejected", index: 0, reason: "conflict" },
    );
    expect(summary).toContain("encountered a name or quantity conflict");
    expect(summary).toContain("(item #1)");
    expect(summary).not.toContain("{");
  });

  it("handles rejection due to not_found with clean item position", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "remove_items",
      { items: [{ id: 1, expectedName: "Old Milk" }] },
      { status: "rejected", index: 0, reason: "not_found" },
    );
    expect(summary).toContain("the item (item #1) was not found");
    expect(summary).toContain("Please check your current kitchen state.");
  });

  it("handles request_id_reused clearly", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "add_items",
      { items: [{ name: "Pepper" }] },
      { status: "request_id_reused" },
    );
    expect(summary).toContain("already used for a different operation");
  });
});
