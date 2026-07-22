// src/lib/db.ts — THE BOUNDARY (database edition).
// Only file that imports the postgres driver. Swap DB/driver/host = change this file only.

import postgres from "postgres";

// DATABASE_URL must point at the dedicated `mise_app` login role (issue #64):
// non-owner, NOBYPASSRLS, no direct table DML. Owner/`BYPASSRLS` credentials
// stay out of the application pool (local tests use ADMIN_DATABASE_URL only
// for fixture setup).
//
// Production uses Supavisor's transaction pooler, where consecutive queries can
// land on different Postgres connections. Prepared statements are connection-local,
// so Postgres.js must send each query without trying to reuse one across connections.
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export type Turnover = "high" | "low";

export type Item = {
  id: number;
  name: string;
  quantity: string;
  turnover: Turnover;
  created_at: string;
  user_id: string;
};

export type KitchenTool = {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  created_at: string;
};

export type DatabaseConnectionSafety = {
  currentUser: string;
  sessionUser: string;
  rolsuper: boolean;
  rolinherit: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  canSetAuthenticated: boolean;
  hasUnexpectedMemberships: boolean;
  ownsPublicTables: boolean;
};

/**
 * Inspect the live pool role. Used by integration tests and production
 * verification after rotating DATABASE_URL onto `mise_app`.
 */
export async function getDatabaseConnectionSafety(): Promise<DatabaseConnectionSafety> {
  const [row] = await sql<
    {
      current_user: string;
      session_user: string;
      rolsuper: boolean;
      rolinherit: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      can_set_authenticated: boolean;
      has_unexpected_memberships: boolean;
      owns_public_tables: boolean;
    }[]
  >`
    select
      current_user,
      session_user,
      r.rolsuper,
      r.rolinherit,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      r.rolbypassrls,
      pg_has_role(r.oid, 'authenticated', 'MEMBER') as can_set_authenticated,
      exists (
        select 1
        from pg_auth_members membership
        join pg_roles parent_role on parent_role.oid = membership.roleid
        where membership.member = r.oid
          and parent_role.rolname <> 'authenticated'
      ) as has_unexpected_memberships,
      exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
          and c.relowner = r.oid
      ) as owns_public_tables
    from pg_roles r
    where r.rolname = current_user
  `;
  return {
    currentUser: row.current_user,
    sessionUser: row.session_user,
    rolsuper: row.rolsuper,
    rolinherit: row.rolinherit,
    rolcreatedb: row.rolcreatedb,
    rolcreaterole: row.rolcreaterole,
    rolreplication: row.rolreplication,
    rolbypassrls: row.rolbypassrls,
    canSetAuthenticated: row.can_set_authenticated,
    hasUnexpectedMemberships: row.has_unexpected_memberships,
    ownsPublicTables: row.owns_public_tables,
  };
}

// Connect as `mise_app` (fail closed: no table DML, no BYPASSRLS). Each request
// enters withUserContext, which SET ROLE authenticated + stamps auth.uid() so
// ownership policies on items, kitchen_tools, conversations, and messages apply.
// App-level user_id / parent-ownership predicates remain the first layer; RLS is
// the second. Omitting withUserContext cannot silently run as table owner.
async function withUserContext<T>(
  userId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

export async function getItems(userId: string): Promise<Item[]> {
  return withUserContext(userId, (tx) =>
    tx<Item[]>`
      select * from items
      where user_id = ${userId}
      order by created_at desc
    `,
  );
}

export async function addItem(
  userId: string,
  name: string,
  quantity: string,
  turnover: Turnover = "high",
): Promise<Item> {
  return withUserContext(userId, async (tx) => {
    const [item] = await tx<Item[]>`
      insert into items (user_id, name, quantity, turnover)
      values (${userId}, ${name}, ${quantity}, ${turnover})
      returning *
    `;
    return item;
  });
}

export async function updateItem(
  userId: string,
  id: number,
  quantity: string,
  name?: string,
  turnover?: Turnover,
): Promise<Item> {
  return withUserContext(userId, async (tx) => {
    const [item] = await tx<Item[]>`
      update items
      set quantity = ${quantity}${name !== undefined ? tx`, name = ${name}` : tx``}${turnover !== undefined ? tx`, turnover = ${turnover}` : tx``}
      where id = ${id} and user_id = ${userId}
      returning *
    `;
    return item;
  });
}

export async function deleteItem(userId: string, id: number): Promise<void> {
  await withUserContext(userId, (tx) =>
    tx`
      delete from items
      where id = ${id} and user_id = ${userId}
    `,
  );
}

export async function getKitchenTools(userId: string): Promise<KitchenTool[]> {
  return withUserContext(userId, (tx) =>
    tx<KitchenTool[]>`
      select * from kitchen_tools
      where user_id = ${userId}
      order by created_at desc
    `,
  );
}

export async function addKitchenTool(userId: string, name: string, kind: string): Promise<KitchenTool> {
  return withUserContext(userId, async (tx) => {
    const [tool] = await tx<KitchenTool[]>`
      insert into kitchen_tools (user_id, name, kind)
      values (${userId}, ${name}, ${kind})
      returning *
    `;
    return tool;
  });
}

export async function updateKitchenTool(
  userId: string,
  id: string,
  name: string,
  kind: string,
): Promise<KitchenTool> {
  return withUserContext(userId, async (tx) => {
    const [tool] = await tx<KitchenTool[]>`
      update kitchen_tools
      set name = ${name}, kind = ${kind}
      where id = ${id} and user_id = ${userId}
      returning *
    `;
    return tool;
  });
}

export async function deleteKitchenTool(userId: string, id: string): Promise<void> {
  await withUserContext(userId, (tx) =>
    tx`
      delete from kitchen_tools
      where id = ${id} and user_id = ${userId}
    `,
  );
}

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export async function createConversation(userId: string, title: string, id: string): Promise<Conversation> {
  return withUserContext(userId, async (tx) => {
    const [conversation] = await tx<Conversation[]>`
      insert into conversations (id, user_id, title)
      values (${id}, ${userId}, ${title})
      returning *
    `;
    return conversation;
  });
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  return withUserContext(userId, (tx) =>
    tx<Conversation[]>`
      select * from conversations
      where user_id = ${userId}
      order by created_at desc
    `,
  );
}

export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  return withUserContext(userId, async (tx) => {
    const [conversation] = await tx<Conversation[]>`
      select * from conversations
      where id = ${id} and user_id = ${userId}
    `;
    return conversation ?? null;
  });
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  // messages rows cascade via the ON DELETE CASCADE FK on messages.conversation_id.
  await withUserContext(userId, (tx) =>
    tx`
      delete from conversations
      where id = ${id} and user_id = ${userId}
    `,
  );
}

export async function getMessages(userId: string, conversationId: string): Promise<Message[]> {
  // Ownership is enforced twice: the where-exists predicate (app layer) and the
  // messages_via_conversation_owner RLS policy (database layer).
  return withUserContext(userId, (tx) =>
    tx<Message[]>`
      select m.*
      from messages m
      where m.conversation_id = ${conversationId}
        and exists (
          select 1
          from conversations c
          where c.id = m.conversation_id
            and c.user_id = ${userId}
        )
      order by m.created_at asc
    `,
  );
}

export async function addMessage(
  userId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<Message> {
  // Require parent ownership in the insert itself. RLS also checks this; the
  // explicit predicate keeps the first authorization layer in application SQL
  // and blocks cross-user appends even if a future caller skips a prior lookup.
  return withUserContext(userId, async (tx) => {
    const [message] = await tx<Message[]>`
      insert into messages (conversation_id, role, content)
      select ${conversationId}, ${role}, ${content}
      where exists (
        select 1
        from conversations c
        where c.id = ${conversationId}
          and c.user_id = ${userId}
      )
      returning *
    `;
    if (!message) {
      throw new Error("conversation not found or not owned by user");
    }
    return message;
  });
}
