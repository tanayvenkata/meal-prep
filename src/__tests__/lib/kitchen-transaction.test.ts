import { AsyncResource } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addItem, addKitchenTool, getItems, getKitchenTools, withKitchenTransaction, runKitchenWrite, KitchenWriteRejection } from "@/lib/db";
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
