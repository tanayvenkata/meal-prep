import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  adjustItemQuantityByCanonicalName,
  setItemQuantityByCanonicalName,
} from "@/lib/db";
import type { StructuredPantryQuantity } from "@/lib/pantry-quantity";

const adminSql = postgres(
  process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL!,
);

const TEST_USER_A = "00000000-0000-0000-0000-000000000041";
const TEST_USER_B = "00000000-0000-0000-0000-000000000042";

function structured(
  amount: string,
  unit: StructuredPantryQuantity["unit"],
): StructuredPantryQuantity {
  return {
    mode: "structured",
    amount,
    unit,
    text: null,
  };
}

async function insertStructuredItem(
  userId: string,
  name: string,
  amount: string,
  unit: StructuredPantryQuantity["unit"],
) {
  const [item] = await adminSql`
    insert into items (
      user_id,
      name,
      quantity_text,
      quantity_value,
      quantity_unit
    )
    values (${userId}, ${name}, '', ${amount}::numeric, ${unit})
    returning *
  `;
  return item;
}

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
      (${TEST_USER_A}, 'adjust-a@test.com', 'x', now(), now(), now(), '{}', '{}'),
      (${TEST_USER_B}, 'adjust-b@test.com', 'x', now(), now(), now(), '{}', '{}')
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

describe("adjustItemQuantityByCanonicalName", () => {
  it("consumes an exact same-unit amount and returns truthful before/after values", async () => {
    await insertStructuredItem(TEST_USER_A, "Duck Eggs", "12", "count");

    const result = await adjustItemQuantityByCanonicalName(
      TEST_USER_A,
      " duck   eggs ",
      "consume",
      structured("12", "count"),
      structured("2", "count"),
    );

    expect(result).toMatchObject({
      status: "applied",
      beforeQuantity: "12",
      afterQuantity: "10",
      item: {
        name: "Duck Eggs",
        quantity: "10",
        quantity_value: "10",
        quantity_unit: "count",
      },
      before: structured("12", "count"),
      after: structured("10", "count"),
    });
  });

  it("restocks with exact decimal arithmetic", async () => {
    await insertStructuredItem(TEST_USER_A, "Olive Oil", "0.1", "l");

    const result = await adjustItemQuantityByCanonicalName(
      TEST_USER_A,
      "olive oil",
      "restock",
      structured("0.1", "l"),
      structured("0.2", "l"),
    );

    expect(result).toMatchObject({
      status: "applied",
      beforeQuantity: "0.1 l",
      afterQuantity: "0.3 l",
      item: { quantity_value: "0.3", quantity_unit: "l" },
    });
  });

  it("returns not_found without touching another user's canonical match", async () => {
    const other = await insertStructuredItem(
      TEST_USER_B,
      "Flour",
      "2",
      "lb",
    );

    await expect(
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Flour",
        "consume",
        structured("2", "lb"),
        structured("1", "lb"),
      ),
    ).resolves.toEqual({ status: "not_found" });

    const [stored] = await adminSql`
      select quantity from items where id = ${other.id}
    `;
    expect(stored.quantity).toBe("2 lb");
  });

  it("does not perform arithmetic on unknown or free-text quantities", async () => {
    await adminSql`
      insert into items (user_id, name, quantity_text)
      values (${TEST_USER_A}, 'Milk', 'about half a carton')
    `;

    await expect(
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Milk",
        "consume",
        structured("0.5", "carton"),
        structured("0.25", "carton"),
      ),
    ).resolves.toEqual({
      status: "unsupported_quantity",
      currentDisplay: "about half a carton",
    });
  });

  it("does not perform arithmetic on a database-valid but unsupported unit", async () => {
    await adminSql`
      insert into items (
        user_id,
        name,
        quantity_value,
        quantity_unit
      )
      values (${TEST_USER_A}, 'Protein powder', 4, 'scoop')
    `;

    await expect(
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Protein powder",
        "consume",
        structured("4", "count"),
        structured("1", "count"),
      ),
    ).resolves.toEqual({
      status: "unsupported_quantity",
      currentDisplay: "4 scoop",
    });
  });

  it("returns unit_mismatch for incompatible expected or delta units", async () => {
    await insertStructuredItem(TEST_USER_A, "Flour", "2", "lb");

    await expect(
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Flour",
        "consume",
        structured("2", "lb"),
        structured("1", "oz"),
      ),
    ).resolves.toEqual({
      status: "unit_mismatch",
      expectedUnit: "lb",
      deltaUnit: "oz",
    });
  });

  it("returns conflict when the locked current value differs from expected", async () => {
    await insertStructuredItem(TEST_USER_A, "Eggs", "12", "count");

    await expect(
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Eggs",
        "consume",
        structured("10", "count"),
        structured("2", "count"),
      ),
    ).resolves.toEqual({
      status: "conflict",
      current: structured("12", "count"),
    });
  });

  it("treats a changed current unit as a stale expectation conflict", async () => {
    await insertStructuredItem(TEST_USER_A, "Flour", "2", "lb");

    await expect(
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Flour",
        "consume",
        structured("2", "kg"),
        structured("1", "kg"),
      ),
    ).resolves.toEqual({
      status: "conflict",
      current: structured("2", "lb"),
    });
  });

  it("rejects a consume that would make inventory negative", async () => {
    await insertStructuredItem(TEST_USER_A, "Eggs", "1", "count");

    await expect(
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Eggs",
        "consume",
        structured("1", "count"),
        structured("2", "count"),
      ),
    ).resolves.toEqual({
      status: "insufficient_quantity",
      current: structured("1", "count"),
      delta: structured("2", "count"),
    });
  });

  it("rejects a restock above the database amount bound", async () => {
    await insertStructuredItem(
      TEST_USER_A,
      "Rice",
      "999999999.999999",
      "g",
    );

    await expect(
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Rice",
        "restock",
        structured("999999999.999999", "g"),
        structured("0.000001", "g"),
      ),
    ).resolves.toEqual({
      status: "amount_exceeded",
      current: structured("999999999.999999", "g"),
      delta: structured("0.000001", "g"),
    });
  });

  it("allows only one concurrent caller with the same expectation to apply", async () => {
    await insertStructuredItem(TEST_USER_A, "Eggs", "12", "count");

    const results = await Promise.all([
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Eggs",
        "consume",
        structured("12", "count"),
        structured("2", "count"),
      ),
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Eggs",
        "consume",
        structured("12", "count"),
        structured("2", "count"),
      ),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "applied",
      "conflict",
    ]);
    const conflict = results.find(({ status }) => status === "conflict");
    expect(conflict).toEqual({
      status: "conflict",
      current: structured("10", "count"),
    });

    const [stored] = await adminSql`
      select quantity from items
      where user_id = ${TEST_USER_A}
        and name_key = public.canonical_pantry_name('Eggs')
    `;
    expect(stored.quantity).toBe("10");
  });

  it("serializes exact-set and relative adjustment without a lost update", async () => {
    await insertStructuredItem(TEST_USER_A, "Eggs", "12", "count");

    const [adjustment, exactSet] = await Promise.all([
      adjustItemQuantityByCanonicalName(
        TEST_USER_A,
        "Eggs",
        "consume",
        structured("12", "count"),
        structured("2", "count"),
      ),
      setItemQuantityByCanonicalName(
        TEST_USER_A,
        "Eggs",
        structured("20", "count"),
      ),
    ]);

    expect(["applied", "conflict"]).toContain(adjustment.status);
    expect(exactSet.status).toBe("updated");
    const [stored] = await adminSql`
      select quantity from items
      where user_id = ${TEST_USER_A}
        and name_key = public.canonical_pantry_name('Eggs')
    `;
    expect(stored.quantity).toBe("20");
  });
});
