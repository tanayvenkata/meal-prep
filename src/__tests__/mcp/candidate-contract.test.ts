import { afterEach, describe, expect, it, vi } from "vitest";
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
      { status: "applied", replayed: false, results: [{ status: "created" }] },
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
      { status: "applied", replayed: false, results: [{ status: "created" }, { status: "created" }, { status: "created" }] },
    );
    expect(summary).toBe("Added 3 items to your kitchen: Eggs, Milk, Butter.");
  });

  it("generates natural spoken confirmation for single item edit", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "edit_items",
      { items: [{ id: 1, expectedName: "Olive oil", operation: "replace" }] },
      { status: "applied", replayed: false, results: [{ status: "updated" }] },
    );
    expect(summary).toBe("Updated Olive oil in your kitchen.");
  });

  it("generates natural spoken confirmation for single item removal", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "remove_items",
      { items: [{ id: 2, expectedName: "Cumin", collection: "pantry" }] },
      { status: "applied", replayed: false, results: [{ status: "deleted" }] },
    );
    expect(summary).toBe("Removed Cumin from your kitchen.");
  });

  it("handles multiple item removals with clean pluralization", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech(
      "remove_items",
      { items: [{ expectedName: "Salt" }, { expectedName: "Sugar" }] },
      { status: "applied", replayed: false, results: [{ status: "deleted" }, { status: "deleted" }] },
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


describe("mutation confirmation evidence", () => {
  it("does not claim a named duplicate was added or its requested quantity saved", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    expect(summarizeMutationForSpeech("add_items", { items: [{ name: "Eggs", quantity: { amount: "24", unit: "count" } }] }, {
      status: "applied", results: [{ status: "already_exists", item: { name: "Eggs", quantity: "6 count" } }],
    })).toBe("Left Eggs unchanged in your kitchen.");
  });

  it("distinguishes new purchases, restocks, and no-ops in the same receipt batch", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    expect(summarizeMutationForSpeech("add_items", { items: [{ name: "Milk" }, { expectedName: "Eggs", operation: "increase" }, { name: "Rice" }] }, {
      status: "applied", results: [{ status: "created", item: { name: "Milk" } }, { status: "applied", name: "Eggs" }, { status: "already_exists", item: { name: "Rice" } }],
    })).toBe("Added Milk to your kitchen. Updated Eggs in your kitchen. Left Rice unchanged in your kitchen.");
  });

  it("uses saved names and distinguishes unchanged edits", async () => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    expect(summarizeMutationForSpeech("edit_items", { items: [{ expectedName: "old name", name: "requested name" }] }, {
      status: "applied", results: [{ status: "unchanged", item: { name: "saved name" } }],
    })).toBe("Left saved name unchanged in your kitchen.");
  });

  it.each([undefined, [], [{ status: "mystery" }], [{ status: "deleted" }]])("does not infer a successful add from missing or incompatible effects %j", async (results) => {
    const { summarizeMutationForSpeech } = await import("@/mcp/server");
    const summary = summarizeMutationForSpeech("add_items", { items: [{ name: "Eggs" }] }, { status: "applied", results });
    expect(summary).toContain("could not be confirmed");
    expect(summary).not.toContain("Added");
  });
});


describe("four-tool confirmations over the MCP wire", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps rejection and no-op results authoritative while completion metadata stays neutral", async () => {
    vi.stubEnv("MCP_PUBLIC_URL", "https://mise.example/mcp");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const { handleMiseMcpRequest } = await import("@/mcp/server");
    const unchanged = { status: "applied" as const, requestId, replayed: false, results: [{ status: "already_exists", item: { name: "Eggs", quantity: "6 count" } }] };
    const rejected = { status: "rejected" as const, requestId, replayed: false, index: 0, reason: "conflict" };
    const addItems = vi.fn().mockResolvedValueOnce(unchanged).mockResolvedValueOnce(rejected);
    const request = async (method: string, params?: unknown) => {
      const response = await handleMiseMcpRequest(new Request("https://mise.example/mcp", {
        method: "POST", headers: { Authorization: "Bearer fixture-token", "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }), { toolSurface: "four", addItems, verifyAccessToken: async token => ({ token, clientId: "fixture-client", scopes: ["openid"], expiresAt: Date.now() / 1000 + 60, extra: { userId: "fixture-user" } }) });
      expect(response.status).toBe(200);
      return response.json();
    };
    const catalog = await request("tools/list");
    for (const [name, label] of [["add_items", "Save request finished."], ["edit_items", "Update request finished."], ["remove_items", "Removal request finished."]]) {
      expect(catalog.result.tools.find((tool: { name: string }) => tool.name === name)._meta["openai/toolInvocation/invoked"]).toBe(label);
    }
    const params = { name: "add_items", arguments: { requestId, items: [{ name: "Eggs", quantity: { amount: "24", unit: "count" } }] } };
    const first = await request("tools/call", params);
    expect(first.result.structuredContent).toEqual(unchanged);
    expect(first.result.content[0].text).toBe("Left Eggs unchanged in your kitchen.");
    const second = await request("tools/call", params);
    expect(second.result.structuredContent).toEqual(rejected);
    expect(second.result.content[0].text).toContain("Could not update kitchen");
    expect(addItems).toHaveBeenCalledTimes(2);
  });
});
