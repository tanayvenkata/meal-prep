import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";

const sql = postgres(
  process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL!,
);

const USER_A = "00000000-0000-0000-0000-000000000ca1";
const USER_B = "00000000-0000-0000-0000-000000000ca2";

beforeAll(async () => {
  await sql`
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
      (${USER_A}, 'canonical-a@test.com', 'x', now(), now(), now(), '{}', '{}'),
      (${USER_B}, 'canonical-b@test.com', 'x', now(), now(), now(), '{}', '{}')
    on conflict (id) do nothing
  `;
});

beforeEach(async () => {
  await sql`delete from items where user_id in (${USER_A}, ${USER_B})`;
});

afterAll(async () => {
  await sql`delete from items where user_id in (${USER_A}, ${USER_B})`;
  await sql`delete from auth.users where id in (${USER_A}, ${USER_B})`;
  await sql.end({ timeout: 5 });
});

describe("canonical pantry identity migration", () => {
  it("generates an NFKC, whitespace-collapsed, case-normalized key", async () => {
    const [item] = await sql<{ name: string; name_key: string }[]>`
      insert into items (user_id, name, quantity_text)
      values (${USER_A}, ${"\t\nＣａｆｅ\u0301\t  Beans\n\t"}, '1 bag')
      returning name, name_key
    `;

    expect(item).toEqual({
      name: "\t\nＣａｆｅ\u0301\t  Beans\n\t",
      name_key: "café beans",
    });
  });

  it("rejects a canonical duplicate for one user but permits it for another", async () => {
    await sql`
      insert into items (user_id, name, quantity_text)
      values (${USER_A}, '  Duck Eggs  ', '12')
    `;

    await expect(
      sql`
        insert into items (user_id, name, quantity_text)
        values (${USER_A}, ${"duck\t eggs"}, '6')
      `,
    ).rejects.toThrow(/items_user_id_name_key_key|duplicate key/i);

    await expect(
      sql`
        insert into items (user_id, name, quantity_text)
        values (${USER_B}, 'DUCK EGGS', '6')
        returning id
      `,
    ).resolves.toHaveLength(1);
  });

  it("rejects ownerless pantry rows", async () => {
    await expect(
      sql`insert into items (name, quantity_text) values ('Ownerless', '1')`,
    ).rejects.toThrow(/user_id|null value/i);
  });

  it("installs the owned newest-first list index", async () => {
    const [index] = await sql<{ indexdef: string }[]>`
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'items'
        and indexname = 'items_user_id_created_at_id_idx'
    `;

    expect(index.indexdef).toContain(
      "(user_id, created_at DESC, id DESC)",
    );
  });
});
