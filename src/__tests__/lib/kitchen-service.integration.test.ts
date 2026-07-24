import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  createKitchenTool,
  createPantryItem,
  deleteKitchenTool,
  deletePantryItem,
  getKitchenContext,
  setPantryItemQuantity,
  updateKitchenTool,
  updatePantryItem,
} from "@/lib/kitchen-service";
import {
  deleteItem as deleteItemRecord,
  deleteKitchenTool as deleteKitchenToolRecord,
  updateItem as updateItemRecord,
  updateKitchenTool as updateKitchenToolRecord,
} from "@/lib/db";

const adminSql = postgres(
  process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL!,
);
const TEST_USER_A = "00000000-0000-0000-0000-000000000031";
const TEST_USER_B = "00000000-0000-0000-0000-000000000032";

beforeAll(async () => {
  await adminSql`
    insert into auth.users (
      id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data
    )
    values
      (${TEST_USER_A}, 'mcp-write-a@test.com', 'x', now(), now(), now(), '{}', '{}'),
      (${TEST_USER_B}, 'mcp-write-b@test.com', 'x', now(), now(), now(), '{}', '{}')
    on conflict (id) do nothing
  `;
});

beforeEach(async () => {
  await adminSql`
    delete from kitchen_tools
    where user_id in (${TEST_USER_A}, ${TEST_USER_B})
  `;
  await adminSql`
    delete from items
    where user_id in (${TEST_USER_A}, ${TEST_USER_B})
  `;
});

afterAll(async () => {
  await adminSql`
    delete from kitchen_tools
    where user_id in (${TEST_USER_A}, ${TEST_USER_B})
  `;
  await adminSql`
    delete from items
    where user_id in (${TEST_USER_A}, ${TEST_USER_B})
  `;
  await adminSql`
    delete from auth.users
    where id in (${TEST_USER_A}, ${TEST_USER_B})
  `;
  await adminSql.end();
});

describe("kitchen lifecycle database boundary", () => {
  it("enforces expected display names inside update/delete SQL writes", async () => {
    const pantry = await createPantryItem(TEST_USER_A, {
      name: "Chicken broth",
      quantity: {
        mode: "structured",
        amount: "1",
        unit: "carton",
      },
    });
    const kitchenTool = await createKitchenTool(TEST_USER_A, {
      name: "Dutch oven",
      kind: "cookware",
    });
    if (
      !pantry.ok
      || pantry.value.status !== "created"
      || !kitchenTool.ok
      || kitchenTool.value.status !== "created"
    ) {
      throw new Error("expected lifecycle fixtures");
    }

    const pantryId = Number(pantry.value.item.id);
    await expect(updateItemRecord(
      TEST_USER_A,
      pantryId,
      { name: "Chicken stock" },
      "Stale pantry name",
    )).resolves.toEqual({ status: "not_found" });
    await expect(deleteItemRecord(
      TEST_USER_A,
      pantryId,
      "Stale pantry name",
    )).resolves.toEqual({ status: "not_found" });

    const tool = kitchenTool.value.tool;
    await expect(updateKitchenToolRecord(
      TEST_USER_A,
      tool.id,
      "Enameled Dutch oven",
      "cookware",
      "Stale tool name",
    )).resolves.toEqual({ status: "not_found" });
    await expect(deleteKitchenToolRecord(
      TEST_USER_A,
      tool.id,
      "Stale tool name",
    )).resolves.toEqual({ status: "not_found" });

    const context = await getKitchenContext(TEST_USER_A);
    expect(context.pantry).toMatchObject([{ name: "Chicken broth" }]);
    expect(context.tools).toMatchObject([{ name: "Dutch oven" }]);
  });

  it("creates, updates, and deletes only the authenticated user's pantry item", async () => {
    const createdA = await createPantryItem(TEST_USER_A, {
      name: "Chicken breast",
      quantity: {
        mode: "structured",
        amount: "1",
        unit: "package",
      },
    });
    const createdB = await createPantryItem(TEST_USER_B, {
      name: "Chicken breast",
      quantity: {
        mode: "structured",
        amount: "2",
        unit: "package",
      },
    });
    if (
      !createdA.ok
      || createdA.value.status !== "created"
      || !createdB.ok
      || createdB.value.status !== "created"
    ) {
      throw new Error("expected isolated pantry rows");
    }

    const itemA = createdA.value.item;
    const itemAId = Number(itemA.id);
    await expect(updatePantryItem(TEST_USER_A, {
      id: itemAId,
      expectedName: "Chicken breast",
      name: "Chicken broth",
    })).resolves.toMatchObject({
      ok: true,
      value: {
        status: "updated",
        item: { id: itemA.id, name: "Chicken broth" },
      },
    });

    const contextA = await getKitchenContext(TEST_USER_A);
    const contextB = await getKitchenContext(TEST_USER_B);
    expect(contextA.pantry).toMatchObject([
      { id: itemAId, name: "Chicken broth", quantity: "1 package" },
    ]);
    expect(contextB.pantry).toMatchObject([
      { name: "Chicken breast", quantity: "2 package" },
    ]);

    await expect(deletePantryItem(TEST_USER_A, {
      id: itemAId,
      expectedName: "Chicken broth",
    })).resolves.toEqual({
      ok: true,
      value: { status: "deleted", id: itemAId },
    });
    await expect(deletePantryItem(TEST_USER_A, {
      id: Number(createdB.value.item.id),
      expectedName: "Chicken breast",
    })).resolves.toMatchObject({
      ok: true,
      value: { status: "not_found" },
    });
    expect((await getKitchenContext(TEST_USER_A)).pantry).toEqual([]);
    expect((await getKitchenContext(TEST_USER_B)).pantry).toHaveLength(1);
  });

  it("creates, updates, and deletes only the authenticated user's kitchen tool", async () => {
    const createdA = await createKitchenTool(TEST_USER_A, {
      name: "Dutch oven",
      kind: "cookware",
    });
    const createdB = await createKitchenTool(TEST_USER_B, {
      name: "Dutch oven",
      kind: "cookware",
    });
    if (
      !createdA.ok
      || createdA.value.status !== "created"
      || !createdB.ok
      || createdB.value.status !== "created"
    ) {
      throw new Error("expected isolated kitchen-tool rows");
    }

    const toolA = createdA.value.tool;
    await expect(updateKitchenTool(TEST_USER_A, {
      id: toolA.id,
      expectedName: "Dutch oven",
      name: "Enameled Dutch oven",
      kind: "cookware",
    })).resolves.toMatchObject({
      ok: true,
      value: {
        status: "updated",
        tool: { id: toolA.id, name: "Enameled Dutch oven" },
      },
    });
    expect((await getKitchenContext(TEST_USER_A)).tools).toMatchObject([
      { id: toolA.id, name: "Enameled Dutch oven" },
    ]);
    expect((await getKitchenContext(TEST_USER_B)).tools).toMatchObject([
      { name: "Dutch oven" },
    ]);

    await expect(deleteKitchenTool(TEST_USER_A, {
      id: toolA.id,
      expectedName: "Enameled Dutch oven",
    })).resolves.toEqual({
      ok: true,
      value: { status: "deleted", id: toolA.id },
    });
    await expect(deleteKitchenTool(TEST_USER_A, {
      id: createdB.value.tool.id,
      expectedName: "Dutch oven",
    })).resolves.toMatchObject({
      ok: true,
      value: { status: "not_found" },
    });
    expect((await getKitchenContext(TEST_USER_A)).tools).toEqual([]);
    expect((await getKitchenContext(TEST_USER_B)).tools).toHaveLength(1);
  });
});

describe("setPantryItemQuantity database boundary", () => {
  it("updates only the authenticated user's match and makes an identical retry a no-op", async () => {
    await adminSql`
      insert into items (user_id, name, quantity_text)
      values
        (${TEST_USER_A}, 'Duck Eggs', '12'),
        (${TEST_USER_B}, 'Duck Eggs', '24')
    `;

    await expect(setPantryItemQuantity(TEST_USER_A, {
      name: " duck   eggs ",
      quantity: {
        mode: "structured",
        amount: "6",
        unit: "count",
      },
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "updated",
        name: "Duck Eggs",
        beforeQuantity: "12",
        quantity: "6",
      },
    });
    await expect(setPantryItemQuantity(TEST_USER_A, {
      name: "DUCK EGGS",
      quantity: {
        mode: "structured",
        amount: "6.000000",
        unit: "count",
      },
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "unchanged",
        name: "Duck Eggs",
        beforeQuantity: "6",
        quantity: "6",
      },
    });

    const rows = await adminSql`
      select user_id, quantity, quantity_text, quantity_value, quantity_unit
      from items
      where name = 'Duck Eggs'
        and user_id in (${TEST_USER_A}, ${TEST_USER_B})
      order by user_id
    `;
    expect(rows).toEqual([
      {
        user_id: TEST_USER_A,
        quantity: "6",
        quantity_text: "",
        quantity_value: "6",
        quantity_unit: "count",
      },
      {
        user_id: TEST_USER_B,
        quantity: "24",
        quantity_text: "24",
        quantity_value: null,
        quantity_unit: null,
      },
    ]);
  });

  it("normalizes decimal amounts and treats a semantic retry as unchanged", async () => {
    await adminSql`
      insert into items (user_id, name, quantity_text)
      values (${TEST_USER_A}, 'Flour', '2 pounds')
    `;

    await expect(setPantryItemQuantity(TEST_USER_A, {
      name: "Flour",
      quantity: {
        mode: "structured",
        amount: "2.000000",
        unit: "lb",
      },
    })).resolves.toMatchObject({
      ok: true,
      value: { status: "updated", quantity: "2 lb" },
    });
    await expect(setPantryItemQuantity(TEST_USER_A, {
      name: "Flour",
      quantity: {
        mode: "structured",
        amount: "2",
        unit: "lb",
      },
    })).resolves.toMatchObject({
      ok: true,
      value: { status: "unchanged", quantity: "2 lb" },
    });
  });

  it("serializes concurrent exact sets so each before value is truthful", async () => {
    await adminSql`
      insert into items (user_id, name, quantity_text)
      values (${TEST_USER_A}, 'Eggs', '12')
    `;

    const results = await Promise.all([
      setPantryItemQuantity(TEST_USER_A, {
        name: "Eggs",
        quantity: {
          mode: "structured",
          amount: "6",
          unit: "count",
        },
      }),
      setPantryItemQuantity(TEST_USER_A, {
        name: "Eggs",
        quantity: {
          mode: "structured",
          amount: "3",
          unit: "count",
        },
      }),
    ]);

    const applied = results.map((result) => {
      if (!result.ok || result.value.status !== "updated") {
        throw new Error("expected both exact sets to apply");
      }
      return result.value;
    });
    const first = applied.find((result) => result.beforeQuantity === "12");
    const second = applied.find((result) => result.beforeQuantity !== "12");

    expect(first).toBeDefined();
    expect(second?.beforeQuantity).toBe(first?.quantity);
    const [stored] = await adminSql<{ quantity: string }[]>`
      select quantity from items
      where user_id = ${TEST_USER_A} and name = 'Eggs'
    `;
    expect(stored.quantity).toBe(second?.quantity);
  });

  it("does not mutate a missing canonical name", async () => {
    await adminSql`
      insert into items (user_id, name, quantity_text)
      values (${TEST_USER_A}, 'Eggs', '12')
    `;

    await expect(setPantryItemQuantity(TEST_USER_A, {
      name: "Milk",
      quantity: {
        mode: "structured",
        amount: "1",
        unit: "gal",
      },
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", name: "Milk" },
    });
    const quantities = await adminSql`
      select quantity
      from items
      where user_id = ${TEST_USER_A}
      order by quantity
    `;
    expect(quantities).toEqual([{ quantity: "12" }]);
  });
});
