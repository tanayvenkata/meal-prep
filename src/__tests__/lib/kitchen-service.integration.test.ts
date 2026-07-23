import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { setPantryItemQuantity } from "@/lib/kitchen-service";

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
    delete from items
    where user_id in (${TEST_USER_A}, ${TEST_USER_B})
  `;
});

afterAll(async () => {
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
      quantity: "6",
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
      quantity: "6",
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
      order by user_id
    `;
    expect(rows).toEqual([
      {
        user_id: TEST_USER_A,
        quantity: "6",
        quantity_text: "6",
        quantity_value: null,
        quantity_unit: null,
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

  it("normalizes unit aliases and treats a semantic retry as unchanged", async () => {
    await adminSql`
      insert into items (user_id, name, quantity_text)
      values (${TEST_USER_A}, 'Flour', '2 pounds')
    `;

    await expect(setPantryItemQuantity(TEST_USER_A, {
      name: "Flour",
      quantity: "2 lb",
    })).resolves.toMatchObject({
      ok: true,
      value: { status: "updated", quantity: "2 lb" },
    });
    await expect(setPantryItemQuantity(TEST_USER_A, {
      name: "Flour",
      quantity: "2 pounds",
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
        quantity: "6",
      }),
      setPantryItemQuantity(TEST_USER_A, {
        name: "Eggs",
        quantity: "3",
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
      quantity: "1 gallon",
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
