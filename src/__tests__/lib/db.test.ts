import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { getItems, addItem, updateItem, deleteItem } from "@/lib/db";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

const TEST_USER_A = "00000000-0000-0000-0000-000000000001";
const TEST_USER_B = "00000000-0000-0000-0000-000000000002";

beforeAll(async () => {
  await sql`
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      (${TEST_USER_A}, 'user-a@test.com', 'x', now(), now(), now(), '{}', '{}'),
      (${TEST_USER_B}, 'user-b@test.com', 'x', now(), now(), now(), '{}', '{}')
    on conflict (id) do nothing
  `;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${TEST_USER_A}, ${TEST_USER_B})`;
  await sql.end();
});

afterEach(async () => {
  await sql`delete from items where user_id in (${TEST_USER_A}, ${TEST_USER_B})`;
});

describe("getItems", () => {
  it("returns only the items belonging to the given user", async () => {
    await sql`insert into items (user_id, name, quantity) values (${TEST_USER_A}, 'eggs', '12')`;
    await sql`insert into items (user_id, name, quantity) values (${TEST_USER_B}, 'milk', '1L')`;

    const items = await getItems(TEST_USER_A);

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("eggs");
    expect(items[0].user_id).toBe(TEST_USER_A);
  });
});

describe("addItem", () => {
  it("inserts an item and returns it with the correct values", async () => {
    const item = await addItem(TEST_USER_A, "eggs", "12");

    expect(item.name).toBe("eggs");
    expect(item.quantity).toBe("12");
    expect(item.user_id).toBe(TEST_USER_A);
    expect(item.id).toBeDefined();
  });
});

describe("updateItem", () => {
  it("updates the quantity of the given item", async () => {
    const [inserted] = await sql`
      insert into items (user_id, name, quantity) values (${TEST_USER_A}, 'eggs', '12') returning *
    `;

    const updated = await updateItem(TEST_USER_A, inserted.id, "6");

    expect(updated.quantity).toBe("6");
    expect(updated.name).toBe("eggs");
  });

  it("updates both name and quantity when name is provided", async () => {
    const [inserted] = await sql`
      insert into items (user_id, name, quantity) values (${TEST_USER_A}, 'eggs', '12') returning *
    `;

    const updated = await updateItem(TEST_USER_A, inserted.id, "6", "duck eggs");

    expect(updated.name).toBe("duck eggs");
    expect(updated.quantity).toBe("6");
  });

  it("cannot update another user's item", async () => {
    const [inserted] = await sql`
      insert into items (user_id, name, quantity) values (${TEST_USER_B}, 'milk', '1L') returning *
    `;

    const result = await updateItem(TEST_USER_A, inserted.id, "2L");

    expect(result).toBeUndefined();
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
