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
  getDatabaseConnectionSafety,
} from "@/lib/db";
import postgres from "postgres";

// Owner connection for fixtures / privilege catalog checks only.
const sql = postgres(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL!);
// Application pool role — same DATABASE_URL src/lib/db.ts uses.
const appSql = postgres(process.env.DATABASE_URL!);

const USER_A = "00000000-0000-0000-0000-0000000000a1";
const USER_B = "00000000-0000-0000-0000-0000000000b2";
const id = () => crypto.randomUUID();

async function asUser<T>(
  userId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  // Impersonate through the real app login role so isolation is proven without BYPASSRLS.
  return appSql.begin(async (tx) => {
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
  await sql.end({ timeout: 5 });
  await appSql.end({ timeout: 5 });
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

  it("database policies reject cross-user inserts under authenticated", async () => {
    const convo = await createConversation(USER_B, "milk chat", id());
    await expect(
      asUser(
        USER_A,
        (tx) => tx`
          insert into items (user_id, name, quantity)
          values (${USER_B}, 'forged milk', '1L')
        `,
      ),
    ).rejects.toThrow();

    await expect(
      asUser(
        USER_A,
        (tx) => tx`
          insert into kitchen_tools (user_id, name, kind)
          values (${USER_B}, 'Forged oven', 'appliance')
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

    await expect(
      asUser(
        USER_A,
        (tx) => tx`
          insert into messages (conversation_id, role, content)
          values (${convo.id}, 'user', 'hijack')
        `,
      ),
    ).rejects.toThrow();
  });

  it("database policies hide cross-user updates under authenticated", async () => {
    const convo = await createConversation(USER_B, "milk chat", id());
    const message = await addMessage(USER_B, convo.id, "user", "starter");
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

    const updatedItems = await asUser(
      USER_A,
      (tx) => tx`update items set name = 'stolen' where id = ${item.id} returning id`,
    );
    const updatedTools = await asUser(
      USER_A,
      (tx) => tx`update kitchen_tools set name = 'stolen' where id = ${tool.id} returning id`,
    );
    const updatedConvos = await asUser(
      USER_A,
      (tx) => tx`update conversations set title = 'stolen' where id = ${convo.id} returning id`,
    );
    const updatedMessages = await asUser(
      USER_A,
      (tx) => tx`update messages set content = 'stolen' where id = ${message.id} returning id`,
    );

    expect(updatedItems).toHaveLength(0);
    expect(updatedTools).toHaveLength(0);
    expect(updatedConvos).toHaveLength(0);
    expect(updatedMessages).toHaveLength(0);
  });

  it("database policies hide cross-user deletes under authenticated", async () => {
    const convo = await createConversation(USER_B, "milk chat", id());
    const message = await addMessage(USER_B, convo.id, "user", "starter");
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
    const deletedMessages = await asUser(
      USER_A,
      (tx) => tx`delete from messages where id = ${message.id} returning id`,
    );

    expect(deletedItems).toHaveLength(0);
    expect(deletedTools).toHaveLength(0);
    expect(deletedConvos).toHaveLength(0);
    expect(deletedMessages).toHaveLength(0);

    // Control: owner still sees B's data.
    expect(await sql`select id from items where id = ${item.id}`).toHaveLength(1);
    expect(await sql`select id from kitchen_tools where id = ${tool.id}`).toHaveLength(1);
    expect(await sql`select id from conversations where id = ${convo.id}`).toHaveLength(1);
    expect(await sql`select id from messages where id = ${message.id}`).toHaveLength(1);
  });

  it("anon has no effective privileges on user-data tables or their sequences", async () => {
    const tables = await sql<{
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
      can_truncate: boolean;
      can_references: boolean;
      can_trigger: boolean;
    }[]>`
      select
        table_name,
        has_table_privilege('anon', format('%I.%I', table_schema, table_name), 'SELECT') as can_select,
        has_table_privilege('anon', format('%I.%I', table_schema, table_name), 'INSERT') as can_insert,
        has_table_privilege('anon', format('%I.%I', table_schema, table_name), 'UPDATE') as can_update,
        has_table_privilege('anon', format('%I.%I', table_schema, table_name), 'DELETE') as can_delete,
        has_table_privilege('anon', format('%I.%I', table_schema, table_name), 'TRUNCATE') as can_truncate,
        has_table_privilege('anon', format('%I.%I', table_schema, table_name), 'REFERENCES') as can_references,
        has_table_privilege('anon', format('%I.%I', table_schema, table_name), 'TRIGGER') as can_trigger
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('items', 'kitchen_tools', 'conversations', 'messages')
      order by table_name
    `;
    expect(tables).toHaveLength(4);
    for (const table of tables) {
      expect(Object.values(table).slice(1)).toEqual(Array(7).fill(false));
    }

    const sequences = await sql<{
      sequence_name: string;
      can_usage: boolean;
      can_select: boolean;
      can_update: boolean;
    }[]>`
      with user_data_sequences as (
        select distinct
          pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname)::regclass as sequence_id
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where n.nspname = 'public'
          and c.relname in ('items', 'kitchen_tools', 'conversations', 'messages')
          and pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) is not null
      )
      select
        sequence_id::text as sequence_name,
        has_sequence_privilege('anon', sequence_id, 'USAGE') as can_usage,
        has_sequence_privilege('anon', sequence_id, 'SELECT') as can_select,
        has_sequence_privilege('anon', sequence_id, 'UPDATE') as can_update
      from user_data_sequences
      order by sequence_name
    `;
    for (const sequence of sequences) {
      expect(Object.values(sequence).slice(1)).toEqual([false, false, false]);
    }
  });

  it("authenticated has only the effective privileges the app needs", async () => {
    const tables = await sql<{
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
      can_truncate: boolean;
      can_references: boolean;
      can_trigger: boolean;
    }[]>`
      select
        table_name,
        has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'SELECT') as can_select,
        has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'INSERT') as can_insert,
        has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'UPDATE') as can_update,
        has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'DELETE') as can_delete,
        has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'TRUNCATE') as can_truncate,
        has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'REFERENCES') as can_references,
        has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'TRIGGER') as can_trigger
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('items', 'kitchen_tools', 'conversations', 'messages')
      order by table_name
    `;
    expect(tables).toHaveLength(4);
    for (const table of tables) {
      expect(Object.values(table).slice(1)).toEqual([
        true,
        true,
        true,
        true,
        false,
        false,
        false,
      ]);
    }

    const sequences = await sql<{
      sequence_name: string;
      can_usage: boolean;
      can_select: boolean;
      can_update: boolean;
    }[]>`
      with user_data_sequences as (
        select distinct
          pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname)::regclass as sequence_id
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where n.nspname = 'public'
          and c.relname in ('items', 'kitchen_tools', 'conversations', 'messages')
          and pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) is not null
      )
      select
        sequence_id::text as sequence_name,
        has_sequence_privilege('authenticated', sequence_id, 'USAGE') as can_usage,
        has_sequence_privilege('authenticated', sequence_id, 'SELECT') as can_select,
        has_sequence_privilege('authenticated', sequence_id, 'UPDATE') as can_update
      from user_data_sequences
      order by sequence_name
    `;
    for (const sequence of sequences) {
      expect(Object.values(sequence).slice(1)).toEqual([true, true, false]);
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

describe("fail-closed application connection (mise_app)", () => {
  it("connects as a non-owner role that cannot bypass RLS", async () => {
    const safety = await getDatabaseConnectionSafety();

    expect(safety.currentUser).toBe("mise_app");
    expect(safety.sessionUser).toBe("mise_app");
    expect(safety.rolsuper).toBe(false);
    expect(safety.rolbypassrls).toBe(false);
    expect(safety.ownsPublicTables).toBe(false);
  });

  it("denies bare queries without withUserContext (no silent owner path)", async () => {
    await addItem(USER_B, "milk", "1L");

    await expect(appSql`select * from items`).rejects.toThrow(/permission denied|must be owner/i);
    await expect(
      appSql`insert into items (user_id, name, quantity) values (${USER_A}, 'eggs', '12')`,
    ).rejects.toThrow(/permission denied|must be owner/i);
  });

  it("still serves same-user data through withUserContext helpers", async () => {
    await addItem(USER_A, "eggs", "12");
    await addKitchenTool(USER_A, "Skillet", "cookware");
    const convo = await createConversation(USER_A, "eggs chat", id());
    await addMessage(USER_A, convo.id, "user", "what can I make?");

    expect((await getItems(USER_A)).map((i) => i.name)).toContain("eggs");
    expect((await getKitchenTools(USER_A)).map((t) => t.name)).toContain("Skillet");
    expect((await listConversations(USER_A)).map((c) => c.title)).toContain("eggs chat");
    expect(await getMessages(USER_A, convo.id)).toHaveLength(1);
  });
});
