import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import {
  getItems,
  getItemByCanonicalName,
  getItemById,
  addItem,
  setItemQuantity,
  updateItem,
  deleteItem,
  getKitchenTools,
  addKitchenTool,
  updateKitchenTool,
  deleteKitchenTool,
} from "@/lib/db";
import postgres from "postgres";

// Owner connection for fixture setup only — app code under test uses mise_app via DATABASE_URL.
const sql = postgres(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL!);

const TEST_USER_A = "00000000-0000-0000-0000-000000000001";
const TEST_USER_B = "00000000-0000-0000-0000-000000000002";

beforeAll(async () => {
  // Conversations now reference auth.users as well. Clear any rows left by a
  // prior interrupted test run before recreating these fixed test identities.
  await sql`delete from conversations where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
  await sql`delete from kitchen_tools where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
  await sql`
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      (${TEST_USER_A}, 'user-a@test.com', 'x', now(), now(), now(), '{}', '{}'),
      (${TEST_USER_B}, 'user-b@test.com', 'x', now(), now(), now(), '{}', '{}')
    on conflict (id) do nothing
  `;
});

afterAll(async () => {
  await sql`delete from conversations where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
  await sql`delete from kitchen_tools where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
  await sql`delete from auth.users where id in (${TEST_USER_A}, ${TEST_USER_B})`;
  await sql.end();
});

// Clean BOTH before and after each test: beforeEach guarantees even the first test
// starts from a known-empty slate (so seed data / leftovers can't pollute it);
// afterEach leaves the DB clean for whatever runs after the suite. Belt and suspenders.
beforeEach(async () => {
  await sql`delete from items where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
  await sql`delete from kitchen_tools where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
});

afterEach(async () => {
  await sql`delete from items where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
  await sql`delete from kitchen_tools where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
});

describe("getItems", () => {
  it("returns only the items belonging to the given user", async () => {
    await sql`insert into items (user_id, name, quantity) values (${TEST_USER_A}, 'eggs', '12')`;
    await sql`insert into items (user_id, name, quantity) values (${TEST_USER_B}, 'milk', '1L')`;

    const items = await getItems(TEST_USER_A);

    // Localized asserts: describe facts about OUR data, not the whole table.
    // True whether the DB has 0 or 400 other rows — so it can't be ambushed by
    // seed data or parallel tests. The real point here is user isolation.
    const names = items.map((i) => i.name);
    expect(names).toContain("eggs"); // A's own item came back
    expect(names).not.toContain("milk"); // B's item did NOT leak in
    expect(items.every((i) => i.user_id === TEST_USER_A)).toBe(true); // no foreign rows
  });
});

describe("addItem", () => {
  it("inserts an item and returns it with the correct values", async () => {
    const result = await addItem(TEST_USER_A, "eggs", "12");

    expect(result.status).toBe("created");
    expect(result.item.name).toBe("eggs");
    expect(result.item.name_key).toBe("eggs");
    expect(result.item.quantity).toBe("12");
    expect(result.item.turnover).toBe("high");
    expect(result.item.user_id).toBe(TEST_USER_A);
    expect(result.item.id).toBeDefined();
  });

  it("returns the existing owned item for canonical duplicate names", async () => {
    const created = await addItem(TEST_USER_A, "Eggs", "12");
    const duplicate = await addItem(TEST_USER_A, "  ＥＧＧＳ  ", "6");

    expect(created.status).toBe("created");
    expect(duplicate).toEqual({
      status: "already_exists",
      item: created.item,
    });
    expect(await getItems(TEST_USER_A)).toHaveLength(1);
  });

  it("allows two users to store the same canonical pantry name", async () => {
    const userA = await addItem(TEST_USER_A, "Eggs", "12");
    const userB = await addItem(TEST_USER_B, " eggs ", "6");

    expect(userA.status).toBe("created");
    expect(userB.status).toBe("created");
    expect(userA.item.id).not.toBe(userB.item.id);
  });
});

describe("canonical item lookup", () => {
  it("finds one owned row across compatibility, whitespace, and case variants", async () => {
    const created = await addItem(TEST_USER_A, "Duck   Eggs", "12");

    await expect(
      getItemByCanonicalName(TEST_USER_A, "  ＤＵＣＫ eggs "),
    ).resolves.toEqual(created.item);
    await expect(
      getItemByCanonicalName(TEST_USER_B, "duck eggs"),
    ).resolves.toBeNull();
    await expect(
      getItemById(TEST_USER_A, created.item.id),
    ).resolves.toEqual(created.item);
  });
});

describe("kitchen tools", () => {
  it("returns only tools belonging to the given user", async () => {
    await addKitchenTool(TEST_USER_A, "Air fryer", "appliance");
    await addKitchenTool(TEST_USER_B, "Sheet pan", "bakeware");

    const tools = await getKitchenTools(TEST_USER_A);

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      user_id: TEST_USER_A,
      name: "Air fryer",
      kind: "appliance",
    });
  });

  it("updates a user's tool", async () => {
    const tool = await addKitchenTool(TEST_USER_A, "Frying pan", "cookware");

    const updated = await updateKitchenTool(TEST_USER_A, tool.id, "12-inch skillet", "cookware");

    expect(updated).toMatchObject({ name: "12-inch skillet", kind: "cookware" });
  });

  it("cannot update or delete another user's tool", async () => {
    const tool = await addKitchenTool(TEST_USER_B, "Oven", "appliance");

    const updated = await updateKitchenTool(TEST_USER_A, tool.id, "My oven", "appliance");
    await deleteKitchenTool(TEST_USER_A, tool.id);

    expect(updated).toBeUndefined();
    const remaining = await sql`select * from kitchen_tools where id = ${tool.id}`;
    expect(remaining).toHaveLength(1);
  });

  it("RLS hides another user's tool from an unfiltered query", async () => {
    await addKitchenTool(TEST_USER_B, "Oven", "appliance");

    const visibleToA = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${TEST_USER_A}, true)`;
      await tx`set local role authenticated`;
      return tx`select * from kitchen_tools where user_id = ${TEST_USER_B}`;
    });

    expect(visibleToA).toHaveLength(0);
  });

  it("deletes the given tool", async () => {
    const tool = await addKitchenTool(TEST_USER_A, "Baking sheet", "bakeware");

    await deleteKitchenTool(TEST_USER_A, tool.id);

    const remaining = await sql`select * from kitchen_tools where id = ${tool.id}`;
    expect(remaining).toHaveLength(0);
  });
});

describe("updateItem", () => {
  it("updates the quantity of the given item", async () => {
    const [inserted] = await sql`
      insert into items (user_id, name, quantity) values (${TEST_USER_A}, 'eggs', '12') returning *
    `;

    const updated = await updateItem(
      TEST_USER_A,
      inserted.id,
      { quantity: "6" },
    );

    expect(updated.status).toBe("updated");
    if (updated.status !== "updated") throw new Error("expected update");
    expect(updated.item.quantity).toBe("6");
    expect(updated.item.name).toBe("eggs");
  });

  it("updates both name and quantity when name is provided", async () => {
    const [inserted] = await sql`
      insert into items (user_id, name, quantity) values (${TEST_USER_A}, 'eggs', '12') returning *
    `;

    const updated = await updateItem(
      TEST_USER_A,
      inserted.id,
      { quantity: "6", name: "duck eggs" },
    );

    expect(updated.status).toBe("updated");
    if (updated.status !== "updated") throw new Error("expected update");
    expect(updated.item.name).toBe("duck eggs");
    expect(updated.item.quantity).toBe("6");
  });

  it("cannot update another user's item", async () => {
    const [inserted] = await sql`
      insert into items (user_id, name, quantity) values (${TEST_USER_B}, 'milk', '1L') returning *
    `;

    const result = await updateItem(
      TEST_USER_A,
      inserted.id,
      { quantity: "2L" },
    );

    expect(result).toEqual({ status: "not_found" });
  });

  it("returns name conflict when a rename collides canonically", async () => {
    const eggs = await addItem(TEST_USER_A, "Eggs", "12");
    const milk = await addItem(TEST_USER_A, "Milk", "1 gallon");

    const result = await updateItem(
      TEST_USER_A,
      milk.item.id,
      { name: " ＥＧＧＳ " },
    );

    expect(eggs.status).toBe("created");
    expect(result).toEqual({ status: "name_conflict" });
  });

  it("does not overwrite fields omitted from a later update", async () => {
    const created = await addItem(TEST_USER_A, "Eggs", "12");
    await setItemQuantity(TEST_USER_A, created.item.id, "6");

    const renamed = await updateItem(
      TEST_USER_A,
      created.item.id,
      { name: "Duck eggs" },
    );

    expect(renamed.status).toBe("updated");
    if (renamed.status !== "updated") throw new Error("expected update");
    expect(renamed.item.name).toBe("Duck eggs");
    expect(renamed.item.quantity).toBe("6");
  });
});

describe("RLS enforcement", () => {
  it("blocks a cross-user unfiltered query when impersonating via authenticated role, but not on the raw connection", async () => {
    await sql`insert into items (user_id, name, quantity) values (${TEST_USER_B}, 'milk', '1L')`;

    // Control: the raw `postgres`-role connection bypasses RLS entirely, so it
    // sees B's row even with a query that has no impersonation at all -- this
    // is the exposure the policy exists to close.
    const viaOwner = await sql`select * from items where user_id = ${TEST_USER_B}`;
    expect(viaOwner).toHaveLength(1);

    // Same query, but run as `authenticated` while impersonating a different
    // user (A) -- RLS should hide B's row, proving the role switch itself is
    // what enforces isolation, not app-level filtering.
    const viaImpersonatedA = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub', ${TEST_USER_A}, true)`;
      await tx`set local role authenticated`;
      return tx`select * from items where user_id = ${TEST_USER_B}`;
    });
    expect(viaImpersonatedA).toHaveLength(0);
  });
});

describe("deleteItem", () => {
  it("deletes the given item", async () => {
    const [inserted] = await sql`
      insert into items (user_id, name, quantity) values (${TEST_USER_A}, 'eggs', '12') returning *
    `;

    await deleteItem(TEST_USER_A, inserted.id);

    const remaining = await sql`select * from items where id = ${inserted.id}`;
    expect(remaining).toHaveLength(0);
  });

  it("cannot delete another user's item", async () => {
    const [inserted] = await sql`
      insert into items (user_id, name, quantity) values (${TEST_USER_B}, 'milk', '1L') returning *
    `;

    await deleteItem(TEST_USER_A, inserted.id);

    const remaining = await sql`select * from items where id = ${inserted.id}`;
    expect(remaining).toHaveLength(1);
  });
});
