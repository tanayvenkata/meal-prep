import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMiseHttpServer } from "@/mcp/server";
import { AsyncResource } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addItem, addKitchenTool, getItems, getKitchenTools, withKitchenTransaction, runKitchenWrite, KitchenWriteRejection } from "@/lib/db";
import { addKitchenItems, editKitchenItems, removeKitchenItems } from "@/lib/kitchen-commands";
import { UNKNOWN_PANTRY_QUANTITY } from "@/lib/pantry-quantity";

const admin = postgres(process.env.ADMIN_DATABASE_URL!);
const userA = randomUUID();
const userB = randomUUID();
beforeAll(async () => {
  for (const id of [userA, userB]) {
    await admin`insert into auth.users (id, email) values (${id}, ${`${id}@transaction.test`})`;
  }
});
afterAll(async () => {
  await admin`delete from items where user_id in (${userA}, ${userB})`;
  await admin`delete from kitchen_tools where user_id in (${userA}, ${userB})`;
  await admin`delete from auth.users where id in (${userA}, ${userB})`;
  await admin.end();
});

describe("owned kitchen transaction scope", () => {
  it("commits pantry and equipment together", async () => {
    await withKitchenTransaction(userA, async () => {
      await addItem(userA, "Committed mayo", UNKNOWN_PANTRY_QUANTITY);
      await addKitchenTool(userA, "Committed skillet", "cookware");
    });
    expect((await getItems(userA)).map(x => x.name)).toContain("Committed mayo");
    expect((await getKitchenTools(userA)).map(x => x.name)).toContain("Committed skillet");
  });
  it("rolls back earlier effects after a later domain rejection", async () => {
    await expect(withKitchenTransaction(userA, async () => {
      await addItem(userA, "Rolled back mayo", UNKNOWN_PANTRY_QUANTITY);
      await addKitchenTool(userA, "Rolled back skillet", "cookware");
      throw new Error("later_line_rejected");
    })).rejects.toThrow("later_line_rejected");
    expect((await getItems(userA)).map(x => x.name)).not.toContain("Rolled back mayo");
    expect((await getKitchenTools(userA)).map(x => x.name)).not.toContain("Rolled back skillet");
  });
  it("rejects cross-user operations and rolls back the original user", async () => {
    await expect(withKitchenTransaction(userA, async () => {
      await addItem(userA, "Identity rollback", UNKNOWN_PANTRY_QUANTITY);
      await addItem(userB, "Foreign write", UNKNOWN_PANTRY_QUANTITY);
    })).rejects.toThrow("kitchen_transaction_identity_mismatch");
    expect((await getItems(userA)).map(x => x.name)).not.toContain("Identity rollback");
    expect(await getItems(userB)).toHaveLength(0);
  });
  it("rejects a captured async context after its transaction closes", async () => {
    let descendant: AsyncResource | undefined;
    await withKitchenTransaction(userA, async () => {
      descendant = new AsyncResource("test-descendant");
    });
    await expect(descendant!.runInAsyncScope(() => getItems(userA))).rejects.toThrow("closed_kitchen_transaction");
    descendant!.emitDestroy();
  });
});


describe("durable kitchen request receipt", () => {
  it("replays a completed request without executing the write again", async () => {
    const id = randomUUID();
    let calls = 0;
    const apply = async () => { calls++; await addItem(userA, "Retry mayo", UNKNOWN_PANTRY_QUANTITY); return ["saved"]; };
    const first = await runKitchenWrite(userA, id, "add_items", { name: "Retry mayo" }, apply);
    const replay = await runKitchenWrite(userA, id, "add_items", { name: "Retry mayo" }, apply);
    expect(first.status).toBe("applied");
    expect(replay).toEqual({ ...first, replayed: true });
    expect(calls).toBe(1);
    expect(await runKitchenWrite(userA, id, "add_items", { name: "Changed" }, apply)).toEqual({ status: "request_id_reused", requestId: id });
    expect(calls).toBe(1);
  });
  it("scopes request identities to owners and normalizes object-key order", async () => {
    const id = randomUUID();
    const a = await runKitchenWrite(userA, id, "add_items", { name: "mayo", quantity: "unknown" }, async () => ["A"]);
    const b = await runKitchenWrite(userB, id, "add_items", { name: "mayo", quantity: "unknown" }, async () => ["B"]);
    expect(b).toEqual({ status: "applied", requestId: id, results: ["B"], replayed: false });
    expect(await runKitchenWrite(userA, id, "add_items", { quantity: "unknown", name: "mayo" }, async () => { throw new Error("must_not_run"); })).toEqual({ ...a, replayed: true });
  });
  it("rolls back and remembers a rejected list", async () => {
    const id = randomUUID();
    const apply = async () => { await addItem(userA, "Rejected receipt mayo", UNKNOWN_PANTRY_QUANTITY); throw new KitchenWriteRejection(1, "not_found"); };
    const rejected = await runKitchenWrite(userA, id, "edit_items", {}, apply);
    expect(rejected).toEqual({ status: "rejected", requestId: id, index: 1, reason: "not_found", replayed: false });
    expect((await getItems(userA)).some(x => x.name === "Rejected receipt mayo")).toBe(false);
    expect(await runKitchenWrite(userA, id, "edit_items", {}, async () => { throw new Error("must_not_run"); })).toEqual({ ...rejected, replayed: true });
  });
  it("serializes concurrent identical requests", async () => {
    const id = randomUUID(); let calls = 0;
    const apply = async () => { calls++; await addItem(userA, "Concurrent mayo", UNKNOWN_PANTRY_QUANTITY); return []; };
    const results = await Promise.all([runKitchenWrite(userA, id, "add_items", {}, apply), runKitchenWrite(userA, id, "add_items", {}, apply)]);
    expect(calls).toBe(1);
    expect(results.filter(x => "replayed" in x && x.replayed)).toHaveLength(1);
  });
  it("does not commit a receipt or partial effects on infrastructure failure", async () => {
    const id = randomUUID();
    await expect(runKitchenWrite(userA, id, "add_items", {}, async () => { await addItem(userA, "Failed infrastructure mayo", UNKNOWN_PANTRY_QUANTITY); throw new Error("dependency_failed"); })).rejects.toThrow("dependency_failed");
    expect((await getItems(userA)).some(x => x.name === "Failed infrastructure mayo")).toBe(false);
    expect(await runKitchenWrite(userA, id, "add_items", {}, async () => [])).toEqual({ status: "applied", requestId: id, results: [], replayed: false });
  });
});


async function seedCommandEggs() {
  const name = `Eggs ${randomUUID()}`;
  expect((await addKitchenItems(userA, { requestId: randomUUID(), items: [{ collection: "pantry", name, quantity: { amount: "4", unit: "count" } }] })).status).toBe("applied");
  return (await getItems(userA)).find(x => x.name === name)!;
}

describe("candidate command effects", () => {
  it("adds unknown food and equipment in one list with safe replay", async () => {
    const command = { requestId: randomUUID(), items: [{ collection: "pantry", name: "Command mayo" }, { collection: "equipment", name: "Command skillet", kind: "cookware" }] };
    const first = await addKitchenItems(userA, command);
    expect(first.status).toBe("applied");
    expect(JSON.stringify(first)).not.toContain("user_id");
    expect(first).toMatchObject({ results: [{ item: { id: expect.any(Number) } }, { tool: { id: expect.any(String) } }] });
    expect(await addKitchenItems(userA, command)).toEqual({ ...first, replayed: true });
    const mayo = (await getItems(userA)).find(x => x.name === "Command mayo")!;
    expect(mayo.quantity_value).toBeNull();
    expect((await getKitchenTools(userA)).some(x => x.name === "Command skillet")).toBe(true);
  });
  it("distinguishes more eggs from a total and prevents a delayed replay after reset", async () => {
    const eggs = await seedCommandEggs();
    const ref = { collection: "pantry", id: Number(eggs.id), expectedName: eggs.name };
    const purchase = { requestId: randomUUID(), items: [{ ...ref, operation: "increase", expectedQuantity: { amount: "4", unit: "count" }, delta: { amount: "12", unit: "count" } }] };
    expect((await editKitchenItems(userA, purchase)).status).toBe("applied");
    expect((await getItems(userA)).find(x => x.id === eggs.id)!.quantity_value).toBe("16");
    expect((await editKitchenItems(userA, { requestId: randomUUID(), items: [{ ...ref, operation: "replace", quantity: { amount: "4", unit: "count" } }] })).status).toBe("applied");
    const replay = await editKitchenItems(userA, purchase);
    expect("replayed" in replay && replay.replayed).toBe(true);
    expect((await getItems(userA)).find(x => x.id === eggs.id)!.quantity_value).toBe("4");
  });
  it("rolls back an earlier edit when the next target is missing", async () => {
    const eggs = await seedCommandEggs();
    const result = await editKitchenItems(userA, { requestId: randomUUID(), items: [
      { collection: "pantry", id: Number(eggs.id), expectedName: eggs.name, operation: "replace", name: "Should roll back" },
      { collection: "equipment", id: randomUUID(), expectedName: "Missing", name: "Still missing", kind: "cookware" },
    ] });
    expect(result.status).toBe("rejected");
    expect((await getItems(userA)).find(x => x.id === eggs.id)!.name).toBe(eggs.name);
  });
  it("rejects foreign removal and permits an owned removal with replay", async () => {
    const eggs = await seedCommandEggs();
    const items = [{ collection: "pantry", id: Number(eggs.id), expectedName: eggs.name }];
    expect((await removeKitchenItems(userB, { requestId: randomUUID(), items })).status).toBe("rejected");
    const command = { requestId: randomUUID(), items };
    const first = await removeKitchenItems(userA, command);
    expect(first.status).toBe("applied");
    expect(await removeKitchenItems(userA, command)).toEqual({ ...first, replayed: true });
    expect((await getItems(userA)).some(x => x.id === eggs.id)).toBe(false);
  });
});


it("exposes exactly four authenticated tools over MCP HTTP and saves unknown quantity", async () => {
  const previous = { supabase: process.env.NEXT_PUBLIC_SUPABASE_URL, publicUrl: process.env.MCP_PUBLIC_URL };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
  process.env.MCP_PUBLIC_URL = "http://localhost:8787/mcp";
  const token = randomUUID();
  const server = createMiseHttpServer({ toolSurface: "four", verifyAccessToken: async presented => {
    if (presented !== token) throw new Error("invalid_fixture_token");
    return { token, clientId: "candidate-test", scopes: ["openid"], expiresAt: Math.floor(Date.now()/1000)+300, extra: { userId: userA } };
  }});
  const client = new Client({ name: "candidate-test", version: "1" });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no_test_address");
    const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
    const unauthenticated = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("www-authenticate")).toContain("resource_metadata");
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    const catalog = await client.listTools();
    expect(catalog.tools.map(x => x.name).sort()).toEqual(["add_items", "edit_items", "read_kitchen", "remove_items"]);
    for (const tool of catalog.tools) expect(tool).toMatchObject({ _meta: { securitySchemes: [{ type: "oauth2" }] } });
    // SDK parsing strips extension fields; inspect the wire for top-level compatibility metadata.
    const wire = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} }) });
    const wireBody = await wire.json();
    for (const tool of wireBody.result.tools) expect(tool).toMatchObject({ securitySchemes: [{ type: "oauth2" }] });
    const result = await client.callTool({ name: "add_items", arguments: { requestId: randomUUID(), items: [{ collection: "pantry", name: "HTTP mayo" }] } });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ status: "applied" });
    const read = await client.callTool({ name: "read_kitchen", arguments: {} });
    expect(read.structuredContent).toMatchObject({ pantry: expect.arrayContaining([expect.objectContaining({ name: "HTTP mayo", quantityMode: "unknown" })]) });
    expect((await getItems(userA)).filter(x => x.name === "HTTP mayo")).toHaveLength(1);
  } finally {
    await client.close();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: previous.supabase, MCP_PUBLIC_URL: previous.publicUrl })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
