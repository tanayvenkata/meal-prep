import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  adjustItemQuantitiesByCanonicalName,
  type BatchPantryQuantityAdjustment,
} from "@/lib/db";
import type { StructuredPantryQuantity } from "@/lib/pantry-quantity";

const adminSql = postgres(
  process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL!,
);

const TEST_USER_A = "00000000-0000-0000-0000-000000000051";
const TEST_USER_B = "00000000-0000-0000-0000-000000000052";

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

function adjustment(
  name: string,
  operation: BatchPantryQuantityAdjustment["operation"],
  expectedAmount: string,
  deltaAmount: string,
  unit: StructuredPantryQuantity["unit"],
): BatchPantryQuantityAdjustment {
  return {
    name,
    operation,
    expected: structured(expectedAmount, unit),
    delta: structured(deltaAmount, unit),
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

async function quantities(userId: string) {
  return adminSql<Array<{ name: string; quantity: string }>>`
    select name, quantity
    from items
    where user_id = ${userId}
    order by name
  `;
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
      (${TEST_USER_A}, 'batch-a@test.com', 'x', now(), now(), now(), '{}', '{}'),
      (${TEST_USER_B}, 'batch-b@test.com', 'x', now(), now(), now(), '{}', '{}')
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

describe("adjustItemQuantitiesByCanonicalName", () => {
  it("applies mixed consume and restock changes in request order", async () => {
    await insertStructuredItem(TEST_USER_A, "Eggs", "12", "count");
    await insertStructuredItem(TEST_USER_A, "Flour", "3", "lb");

    const result = await adjustItemQuantitiesByCanonicalName(TEST_USER_A, [
      adjustment(" flour ", "restock", "3", "1", "lb"),
      adjustment("EGGS", "consume", "12", "2", "count"),
    ]);

    expect(result).toMatchObject({
      status: "applied",
      changes: [
        {
          index: 0,
          operation: "restock",
          item: { name: "Flour", quantity: "4 lb" },
          beforeQuantity: "3 lb",
          afterQuantity: "4 lb",
          before: structured("3", "lb"),
          delta: structured("1", "lb"),
          after: structured("4", "lb"),
        },
        {
          index: 1,
          operation: "consume",
          item: { name: "Eggs", quantity: "10" },
          beforeQuantity: "12",
          afterQuantity: "10",
          before: structured("12", "count"),
          delta: structured("2", "count"),
          after: structured("10", "count"),
        },
      ],
    });
  });

  it("rejects every detectable failure without partially updating", async () => {
    await insertStructuredItem(TEST_USER_A, "Eggs", "12", "count");
    await insertStructuredItem(TEST_USER_A, "Flour", "1", "lb");

    const result = await adjustItemQuantitiesByCanonicalName(TEST_USER_A, [
      adjustment("Eggs", "consume", "12", "2", "count"),
      adjustment("Flour", "consume", "2", "3", "lb"),
      adjustment("Milk", "restock", "1", "1", "carton"),
    ]);

    expect(result).toEqual({
      status: "rejected",
      failures: [
        {
          index: 1,
          name: "Flour",
          status: "conflict",
          current: structured("1", "lb"),
        },
        {
          index: 2,
          name: "Milk",
          status: "not_found",
        },
      ],
    });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Eggs", quantity: "12" },
      { name: "Flour", quantity: "1 lb" },
    ]);
  });

  it("rejects canonical aliases as duplicate targets before locking", async () => {
    await insertStructuredItem(TEST_USER_A, "Duck Eggs", "12", "count");

    const result = await adjustItemQuantitiesByCanonicalName(TEST_USER_A, [
      adjustment("Duck Eggs", "consume", "12", "1", "count"),
      adjustment(" duck   eggs ", "consume", "12", "2", "count"),
      adjustment("Milk", "consume", "1", "1", "carton"),
    ]);

    expect(result).toEqual({
      status: "rejected",
      failures: [
        {
          index: 0,
          name: "Duck Eggs",
          status: "duplicate_target",
          duplicateIndexes: [0, 1],
        },
        {
          index: 1,
          name: " duck   eggs ",
          status: "duplicate_target",
          duplicateIndexes: [0, 1],
        },
        {
          index: 2,
          name: "Milk",
          status: "not_found",
        },
      ],
    });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Duck Eggs", quantity: "12" },
    ]);
  });

  it("handles a request containing only duplicate targets", async () => {
    await insertStructuredItem(TEST_USER_A, "Duck Eggs", "12", "count");

    await expect(
      adjustItemQuantitiesByCanonicalName(TEST_USER_A, [
        adjustment("Duck Eggs", "consume", "12", "1", "count"),
        adjustment(" duck   eggs ", "consume", "12", "2", "count"),
      ]),
    ).resolves.toMatchObject({
      status: "rejected",
      failures: [
        { index: 0, status: "duplicate_target" },
        { index: 1, status: "duplicate_target" },
      ],
    });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Duck Eggs", quantity: "12" },
    ]);
  });

  it("treats another user's matching row as missing and rolls back owned rows", async () => {
    await insertStructuredItem(TEST_USER_A, "Eggs", "12", "count");
    await insertStructuredItem(TEST_USER_B, "Flour", "3", "lb");

    const result = await adjustItemQuantitiesByCanonicalName(TEST_USER_A, [
      adjustment("Eggs", "consume", "12", "2", "count"),
      adjustment("Flour", "consume", "3", "1", "lb"),
    ]);

    expect(result).toEqual({
      status: "rejected",
      failures: [{ index: 1, name: "Flour", status: "not_found" }],
    });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Eggs", quantity: "12" },
    ]);
    await expect(quantities(TEST_USER_B)).resolves.toEqual([
      { name: "Flour", quantity: "3 lb" },
    ]);
  });

  it("rejects every unsafe quantity outcome without changing any row", async () => {
    await adminSql`
      insert into items (user_id, name, quantity_text)
      values (${TEST_USER_A}, 'Milk', 'about half a carton')
    `;
    await insertStructuredItem(TEST_USER_A, "Eggs", "1", "count");
    await insertStructuredItem(TEST_USER_A, "Flour", "2", "lb");
    await insertStructuredItem(
      TEST_USER_A,
      "Rice",
      "999999999.999999",
      "g",
    );

    const result = await adjustItemQuantitiesByCanonicalName(TEST_USER_A, [
      adjustment("Milk", "consume", "1", "1", "carton"),
      adjustment("Eggs", "consume", "1", "2", "count"),
      {
        name: "Flour",
        operation: "consume",
        expected: structured("2", "lb"),
        delta: structured("1", "oz"),
      },
      adjustment(
        "Rice",
        "restock",
        "999999999.999999",
        "0.000001",
        "g",
      ),
    ]);

    expect(result).toEqual({
      status: "rejected",
      failures: [
        {
          index: 0,
          name: "Milk",
          status: "unsupported_quantity",
          currentDisplay: "about half a carton",
        },
        {
          index: 1,
          name: "Eggs",
          status: "insufficient_quantity",
          current: structured("1", "count"),
          delta: structured("2", "count"),
        },
        {
          index: 2,
          name: "Flour",
          status: "unit_mismatch",
          expectedUnit: "lb",
          deltaUnit: "oz",
        },
        {
          index: 3,
          name: "Rice",
          status: "amount_exceeded",
          current: structured("999999999.999999", "g"),
          delta: structured("0.000001", "g"),
        },
      ],
    });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Eggs", quantity: "1" },
      { name: "Flour", quantity: "2 lb" },
      { name: "Milk", quantity: "about half a carton" },
      { name: "Rice", quantity: "999999999.999999 g" },
    ]);
  });

  it("allows only one concurrent same-expectation batch to apply", async () => {
    await insertStructuredItem(TEST_USER_A, "Eggs", "12", "count");
    await insertStructuredItem(TEST_USER_A, "Flour", "3", "lb");

    const forward = [
      adjustment("Eggs", "consume", "12", "2", "count"),
      adjustment("Flour", "consume", "3", "1", "lb"),
    ];
    const reverse = [...forward].reverse();
    const results = await Promise.all([
      adjustItemQuantitiesByCanonicalName(TEST_USER_A, forward),
      adjustItemQuantitiesByCanonicalName(TEST_USER_A, reverse),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "applied",
      "rejected",
    ]);
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      failures: [
        { status: "conflict" },
        { status: "conflict" },
      ],
    });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Eggs", quantity: "10" },
      { name: "Flour", quantity: "2 lb" },
    ]);
  });

  it("rejects an immediate retry without applying any line twice", async () => {
    await insertStructuredItem(TEST_USER_A, "Eggs", "12", "count");
    await insertStructuredItem(TEST_USER_A, "Flour", "3", "lb");
    const batch = [
      adjustment("Eggs", "consume", "12", "2", "count"),
      adjustment("Flour", "consume", "3", "1", "lb"),
    ];

    await expect(
      adjustItemQuantitiesByCanonicalName(TEST_USER_A, batch),
    ).resolves.toMatchObject({ status: "applied" });
    await expect(
      adjustItemQuantitiesByCanonicalName(TEST_USER_A, batch),
    ).resolves.toMatchObject({
      status: "rejected",
      failures: [
        { index: 0, status: "conflict" },
        { index: 1, status: "conflict" },
      ],
    });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Eggs", quantity: "10" },
      { name: "Flour", quantity: "2 lb" },
    ]);
  });
});
