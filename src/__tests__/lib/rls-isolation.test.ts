import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import {
  addItem,
  addKitchenTool,
  createConversation,
  addMessage,
  getMessages,
  listConversations,
  getItems,
  getKitchenTools,
} from "@/lib/db";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

const USER_A = "00000000-0000-0000-0000-0000000000a1";
const USER_B = "00000000-0000-0000-0000-0000000000b2";
const id = () => crypto.randomUUID();

async function asUser<T>(
  userId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

beforeAll(async () => {
  await sql`delete from conversations where user_id in (${USER_A}, ${USER_B})`;
  await sql`delete from kitchen_tools where user_id in (${USER_A}, ${USER_B})`;
  await sql`delete from items where user_id in (${USER_A}, ${USER_B})`;
  await sql`
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      (${USER_A}, 'rls-a@test.com', 'x', now(), now(), now(), '{}', '{}'),
      (${USER_B}, 'rls-b@test.com', 'x', now(), now(), now(), '{}', '{}')
    on conflict (id) do nothing
  `;
});

afterAll(async () => {
  await sql`delete from conversations where user_id in (${USER_A}, ${USER_B})`;
  await sql`delete from kitchen_tools where user_id in (${USER_A}, ${USER_B})`;
  await sql`delete from items where user_id in (${USER_A}, ${USER_B})`;
  await sql`delete from auth.users where id in (${USER_A}, ${USER_B})`;
  await sql.end();
});

beforeEach(async () => {
  await sql`delete from conversations where user_id in (${USER_A}, ${USER_B})`;
  await sql`delete from kitchen_tools where user_id in (${USER_A}, ${USER_B})`;
  await sql`delete from items where user_id in (${USER_A}, ${USER_B})`;
});

afterEach(async () => {
  await sql`delete from conversations where user_id in (${USER_A}, ${USER_B})`;
  await sql`delete from kitchen_tools where user_id in (${USER_A}, ${USER_B})`;
  await sql`delete from items where user_id in (${USER_A}, ${USER_B})`;
});

describe("RLS ownership across all four user-data tables", () => {
  it("app layer helpers never leak user B rows to user A", async () => {
    await addItem(USER_B, "milk", "1L");
    await addKitchenTool(USER_B, "Oven", "appliance");
    const convo = await createConversation(USER_B, "milk chat", id());
    await addMessage(USER_B, convo.id, "user", "what about milk?");

    expect(await getItems(USER_A)).toHaveLength(0);
    expect(await getKitchenTools(USER_A)).toHaveLength(0);
    expect(await listConversations(USER_A)).toHaveLength(0);
    expect(await getMessages(USER_A, convo.id)).toHaveLength(0);
  });

  it("database policies hide unfiltered cross-user selects under authenticated", async () => {
    await addItem(USER_B, "milk", "1L");
    await addKitchenTool(USER_B, "Oven", "appliance");
    const convo = await createConversation(USER_B, "milk chat", id());
    await addMessage(USER_B, convo.id, "user", "what about milk?");

    const items = await asUser(USER_A, (tx) => tx`select * from items`);
    const tools = await asUser(USER_A, (tx) => tx`select * from kitchen_tools`);
    const convos = await asUser(USER_A, (tx) => tx`select * from conversations`);
    const messages = await asUser(
      USER_A,
      (tx) => tx`select * from messages where conversation_id = ${convo.id}`,
    );

    expect(items).toHaveLength(0);
    expect(tools).toHaveLength(0);
    expect(convos).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it("database policies reject cross-user inserts and deletes under authenticated", async () => {
    const convo = await createConversation(USER_B, "milk chat", id());
    await addMessage(USER_B, convo.id, "user", "starter");
    const [item] = await sql`
      insert into items (user_id, name, quantity)
      values (${USER_B}, 'milk', '1L')
      returning id
    `;
    const [tool] = await sql`
      insert into kitchen_tools (user_id, name, kind)
      values (${USER_B}, 'Oven', 'appliance')
      returning id
    `;

    await expect(
      asUser(
        USER_A,
        (tx) => tx`
          insert into messages (conversation_id, role, content)
          values (${convo.id}, 'user', 'hijack')
        `,
      ),
    ).rejects.toThrow();

    await expect(
      asUser(
        USER_A,
        (tx) => tx`
          insert into conversations (id, user_id, title)
          values (${id()}, ${USER_B}, 'forged')
        `,
      ),
    ).rejects.toThrow();

    const deletedItems = await asUser(
      USER_A,
      (tx) => tx`delete from items where id = ${item.id} returning id`,
    );
    const deletedTools = await asUser(
      USER_A,
      (tx) => tx`delete from kitchen_tools where id = ${tool.id} returning id`,
    );
    const deletedConvos = await asUser(
      USER_A,
      (tx) => tx`delete from conversations where id = ${convo.id} returning id`,
    );

    expect(deletedItems).toHaveLength(0);
    expect(deletedTools).toHaveLength(0);
    expect(deletedConvos).toHaveLength(0);

    // Control: owner still sees B's data.
    expect(await sql`select id from items where id = ${item.id}`).toHaveLength(1);
    expect(await sql`select id from kitchen_tools where id = ${tool.id}`).toHaveLength(1);
    expect(await sql`select id from conversations where id = ${convo.id}`).toHaveLength(1);
  });

  it("anon has no DML privileges on user-data tables", async () => {
    const rows = await sql<{ table_name: string; privilege_type: string }[]>`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee = 'anon'
        and table_name in ('items', 'kitchen_tools', 'conversations', 'messages')
        and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      order by table_name, privilege_type
    `;
    expect(rows).toHaveLength(0);
  });

  it("authenticated is limited to select/insert/update/delete on user-data tables", async () => {
    const rows = await sql<{ table_name: string; privilege_type: string }[]>`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee = 'authenticated'
        and table_name in ('items', 'kitchen_tools', 'conversations', 'messages')
      order by table_name, privilege_type
    `;

    const byTable = new Map<string, string[]>();
    for (const row of rows) {
      const list = byTable.get(row.table_name) ?? [];
      list.push(row.privilege_type);
      byTable.set(row.table_name, list);
    }

    for (const table of ["items", "kitchen_tools", "conversations", "messages"]) {
      expect(byTable.get(table)?.sort()).toEqual(
        ["DELETE", "INSERT", "SELECT", "UPDATE"].sort(),
      );
    }
  });

  it("policies use (select auth.uid()) and target authenticated only", async () => {
    const policies = await sql<{
      tablename: string;
      policyname: string;
      roles: string;
      qual: string;
      with_check: string | null;
    }[]>`
      select tablename, policyname, roles::text as roles, qual, with_check
      from pg_policies
      where schemaname = 'public'
        and tablename in ('items', 'kitchen_tools', 'conversations', 'messages')
      order by tablename, policyname
    `;

    expect(policies).toHaveLength(4);
    for (const policy of policies) {
      expect(policy.roles).toContain("authenticated");
      expect(policy.qual).toContain("( SELECT auth.uid()");
      if (policy.with_check) {
        expect(policy.with_check).toContain("( SELECT auth.uid()");
      }
    }
  });
});
