import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  applyReviewedReceiptImport,
  type ReviewedReceiptImportLine,
} from "@/lib/db";
import type { StructuredPantryQuantity } from "@/lib/pantry-quantity";

const adminSql = postgres(
  process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL!,
);

const TEST_USER_A = "00000000-0000-0000-0000-000000000061";
const TEST_USER_B = "00000000-0000-0000-0000-000000000062";

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

function createLine(
  name: string,
  amount: string,
  unit: StructuredPantryQuantity["unit"],
): ReviewedReceiptImportLine {
  return {
    decision: "create",
    name,
    quantity: structured(amount, unit),
    turnover: "high",
  };
}

function restockLine(
  name: string,
  expectedAmount: string,
  deltaAmount: string,
  unit: StructuredPantryQuantity["unit"],
): ReviewedReceiptImportLine {
  return {
    decision: "restock",
    name,
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
  await adminSql`
    insert into items (
      user_id,
      name,
      quantity_text,
      quantity_value,
      quantity_unit
    )
    values (${userId}, ${name}, '', ${amount}::numeric, ${unit})
  `;
}

async function quantities(userId: string) {
  return adminSql<Array<{ name: string; quantity: string }>>`
    select name, quantity
    from items
    where user_id = ${userId}
    order by name
  `;
}

async function receiptCount(userId: string, requestId?: string) {
  const [{ count }] = requestId
    ? await adminSql<Array<{ count: number }>>`
        select count(*)::integer as count
        from private.pantry_operation_receipts
        where user_id = ${userId}
          and request_id = ${requestId}::uuid
      `
    : await adminSql<Array<{ count: number }>>`
        select count(*)::integer as count
        from private.pantry_operation_receipts
        where user_id = ${userId}
      `;
  return count;
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
      (${TEST_USER_A}, 'receipt-a@test.com', 'x', now(), now(), now(), '{}', '{}'),
      (${TEST_USER_B}, 'receipt-b@test.com', 'x', now(), now(), now(), '{}', '{}')
    on conflict (id) do nothing
  `;
});

beforeEach(async () => {
  await adminSql`
    delete from private.pantry_operation_receipts
    where user_id in (${TEST_USER_A}, ${TEST_USER_B})
  `;
  await adminSql`
    delete from items
    where user_id in (${TEST_USER_A}, ${TEST_USER_B})
  `;
});

afterAll(async () => {
  await adminSql`
    delete from private.pantry_operation_receipts
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

describe("applyReviewedReceiptImport", () => {
  it("commits mixed create/restock lines once and replays the stored result", async () => {
    await insertStructuredItem(TEST_USER_A, "Rice", "2", "cup");
    const requestId = randomUUID();
    const lines = [
      createLine("Black beans", "2", "can"),
      restockLine("Rice", "2", "1", "cup"),
    ];

    const applied = await applyReviewedReceiptImport(
      TEST_USER_A,
      requestId,
      lines,
    );
    expect(applied).toMatchObject({
      status: "applied",
      requestId,
      replayed: false,
      changes: [
        {
          index: 0,
          decision: "create",
          item: { name: "Black beans", quantity: "2 can" },
        },
        {
          index: 1,
          decision: "restock",
          item: { name: "Rice", quantity: "3 cup" },
          beforeQuantity: "2 cup",
          afterQuantity: "3 cup",
          before: structured("2", "cup"),
          delta: structured("1", "cup"),
          after: structured("3", "cup"),
        },
      ],
    });

    const replayed = await applyReviewedReceiptImport(
      TEST_USER_A,
      requestId,
      lines,
    );
    expect(replayed).toEqual({ ...applied, replayed: true });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Black beans", quantity: "2 can" },
      { name: "Rice", quantity: "3 cup" },
    ]);
    await expect(receiptCount(TEST_USER_A, requestId)).resolves.toBe(1);
  });

  it("rejects reuse of a request ID with a different semantic payload", async () => {
    const requestId = randomUUID();
    await applyReviewedReceiptImport(TEST_USER_A, requestId, [
      createLine("Black beans", "2", "can"),
    ]);

    await expect(
      applyReviewedReceiptImport(TEST_USER_A, requestId, [
        createLine("Black beans", "3", "can"),
      ]),
    ).resolves.toEqual({ status: "request_id_reused", requestId });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Black beans", quantity: "2 can" },
    ]);
  });

  it("stores business rejections and replays them even after pantry state changes", async () => {
    const requestId = randomUUID();
    const lines = [restockLine("Rice", "2", "1", "cup")];
    const rejected = await applyReviewedReceiptImport(
      TEST_USER_A,
      requestId,
      lines,
    );
    expect(rejected).toEqual({
      status: "rejected",
      requestId,
      replayed: false,
      failures: [{ index: 0, name: "Rice", status: "not_found" }],
    });

    await insertStructuredItem(TEST_USER_A, "Rice", "2", "cup");
    await expect(
      applyReviewedReceiptImport(TEST_USER_A, requestId, lines),
    ).resolves.toEqual({ ...rejected, replayed: true });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Rice", quantity: "2 cup" },
    ]);
  });

  it("rejects canonical duplicates and other failures without a partial write", async () => {
    await insertStructuredItem(TEST_USER_A, "Rice", "2", "cup");
    const requestId = randomUUID();

    await expect(
      applyReviewedReceiptImport(TEST_USER_A, requestId, [
        createLine("Black beans", "2", "can"),
        createLine(" Ｂｌａｃｋ   Ｂｅａｎｓ ", "1", "can"),
        createLine("Rice", "1", "cup"),
      ]),
    ).resolves.toEqual({
      status: "rejected",
      requestId,
      replayed: false,
      failures: [
        {
          index: 0,
          name: "Black beans",
          status: "duplicate_target",
          duplicateIndexes: [0, 1],
        },
        {
          index: 1,
          name: " Ｂｌａｃｋ   Ｂｅａｎｓ ",
          status: "duplicate_target",
          duplicateIndexes: [0, 1],
        },
        {
          index: 2,
          name: "Rice",
          status: "already_exists",
        },
      ],
    });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Rice", quantity: "2 cup" },
    ]);
  });

  it("aggregates unsafe restocks and existing creates without applying valid lines", async () => {
    await insertStructuredItem(TEST_USER_A, "Rice", "2", "cup");
    await insertStructuredItem(
      TEST_USER_A,
      "Flour",
      "999999999.999999",
      "g",
    );
    await insertStructuredItem(TEST_USER_A, "Oats", "3", "cup");
    await insertStructuredItem(TEST_USER_A, "Pasta", "2", "cup");
    await adminSql`
      insert into items (user_id, name, quantity_text)
      values (${TEST_USER_A}, 'Milk', 'about half a carton')
    `;
    const requestId = randomUUID();

    await expect(
      applyReviewedReceiptImport(TEST_USER_A, requestId, [
        createLine("Black beans", "2", "can"),
        createLine("Rice", "1", "cup"),
        restockLine("Milk", "1", "1", "carton"),
        restockLine("Oats", "4", "1", "cup"),
        {
          decision: "restock",
          name: "Flour",
          expected: structured("999999999.999999", "g"),
          delta: structured("0.000001", "g"),
        },
        {
          decision: "restock",
          name: "Pasta",
          expected: structured("2", "cup"),
          delta: structured("1", "lb"),
        },
      ]),
    ).resolves.toMatchObject({
      status: "rejected",
      requestId,
      replayed: false,
      failures: [
        {
          index: 1,
          name: "Rice",
          status: "already_exists",
        },
        {
          index: 2,
          name: "Milk",
          status: "unsupported_quantity",
          currentDisplay: "about half a carton",
        },
        {
          index: 3,
          name: "Oats",
          status: "conflict",
          current: structured("3", "cup"),
        },
        {
          index: 4,
          name: "Flour",
          status: "amount_exceeded",
        },
        {
          index: 5,
          name: "Pasta",
          status: "unit_mismatch",
          expectedUnit: "cup",
          deltaUnit: "lb",
        },
      ],
    });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Flour", quantity: "999999999.999999 g" },
      { name: "Milk", quantity: "about half a carton" },
      { name: "Oats", quantity: "3 cup" },
      { name: "Pasta", quantity: "2 cup" },
      { name: "Rice", quantity: "2 cup" },
    ]);
  });

  it("keeps request IDs and matching canonical names isolated by user", async () => {
    const requestId = randomUUID();
    const lines = [createLine("Black beans", "2", "can")];

    const [left, right] = await Promise.all([
      applyReviewedReceiptImport(TEST_USER_A, requestId, lines),
      applyReviewedReceiptImport(TEST_USER_B, requestId, lines),
    ]);

    expect(left).toMatchObject({ status: "applied", replayed: false });
    expect(right).toMatchObject({ status: "applied", replayed: false });
    await expect(receiptCount(TEST_USER_A, requestId)).resolves.toBe(1);
    await expect(receiptCount(TEST_USER_B, requestId)).resolves.toBe(1);
  });

  it("serializes concurrent identical retries so the mutation occurs once", async () => {
    await insertStructuredItem(TEST_USER_A, "Rice", "2", "cup");
    const requestId = randomUUID();
    const lines = [restockLine("Rice", "2", "1", "cup")];

    const results = await Promise.all([
      applyReviewedReceiptImport(TEST_USER_A, requestId, lines),
      applyReviewedReceiptImport(TEST_USER_A, requestId, lines),
    ]);

    expect(results.map(({ status }) => status)).toEqual([
      "applied",
      "applied",
    ]);
    expect(results.map((result) => (
      "replayed" in result ? result.replayed : null
    )).sort()).toEqual([false, true]);
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Rice", quantity: "3 cup" },
    ]);
    await expect(receiptCount(TEST_USER_A, requestId)).resolves.toBe(1);
  });

  it("allows exactly one payload to claim a concurrently reused request ID", async () => {
    const requestId = randomUUID();
    const results = await Promise.all([
      applyReviewedReceiptImport(TEST_USER_A, requestId, [
        createLine("Black beans", "2", "can"),
      ]),
      applyReviewedReceiptImport(TEST_USER_A, requestId, [
        createLine("Black beans", "3", "can"),
      ]),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "applied",
      "request_id_reused",
    ]);
    await expect(receiptCount(TEST_USER_A, requestId)).resolves.toBe(1);
    await expect(quantities(TEST_USER_A)).resolves.toHaveLength(1);
  });

  it("gives one truthful winner to concurrent create requests", async () => {
    const results = await Promise.all([
      applyReviewedReceiptImport(TEST_USER_A, randomUUID(), [
        createLine("Black beans", "2", "can"),
      ]),
      applyReviewedReceiptImport(TEST_USER_A, randomUUID(), [
        createLine(" black   beans ", "3", "can"),
      ]),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "applied",
      "rejected",
    ]);
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({
      status: "rejected",
      failures: [{ index: 0, status: "already_exists" }],
    });
    await expect(receiptCount(TEST_USER_A)).resolves.toBe(2);
    await expect(quantities(TEST_USER_A)).resolves.toHaveLength(1);
  });

  it("serializes overlapping mixed requests without a partial losing restock", async () => {
    await insertStructuredItem(TEST_USER_A, "Rice", "2", "cup");
    const results = await Promise.all([
      applyReviewedReceiptImport(TEST_USER_A, randomUUID(), [
        createLine("Black beans", "2", "can"),
        restockLine("Rice", "2", "1", "cup"),
      ]),
      applyReviewedReceiptImport(TEST_USER_A, randomUUID(), [
        restockLine(" rice ", "2", "1", "cup"),
        createLine(" black   beans ", "3", "can"),
      ]),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "applied",
      "rejected",
    ]);
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected" });
    expect(
      rejected?.status === "rejected"
        ? rejected.failures.map(({ status }) => status).sort()
        : [],
    ).toEqual(["already_exists", "conflict"]);
    await expect(receiptCount(TEST_USER_A)).resolves.toBe(2);
    const finalPantry = await adminSql<
      Array<{ name_key: string; quantity: string }>
    >`
      select name_key, quantity
      from items
      where user_id = ${TEST_USER_A}
      order by name_key
    `;
    expect(finalPantry.map(({ name_key }) => name_key)).toEqual([
      "black beans",
      "rice",
    ]);
    expect(finalPantry.find(({ name_key }) => name_key === "rice")).toEqual({
      name_key: "rice",
      quantity: "3 cup",
    });
  });

  it("gives one truthful winner to concurrent restocks with the same expectation", async () => {
    await insertStructuredItem(TEST_USER_A, "Rice", "2", "cup");
    const lines = [restockLine("Rice", "2", "1", "cup")];
    const results = await Promise.all([
      applyReviewedReceiptImport(TEST_USER_A, randomUUID(), lines),
      applyReviewedReceiptImport(TEST_USER_A, randomUUID(), lines),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([
      "applied",
      "rejected",
    ]);
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({
      status: "rejected",
      failures: [{ index: 0, status: "conflict" }],
    });
    await expect(quantities(TEST_USER_A)).resolves.toEqual([
      { name: "Rice", quantity: "3 cup" },
    ]);
  });
});
