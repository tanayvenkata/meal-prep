import { AsyncResource } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addItem, addKitchenTool, getItems, getKitchenTools, withKitchenTransaction } from "@/lib/db";
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
