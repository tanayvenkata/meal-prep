// src/lib/db.ts — THE BOUNDARY (database edition).
// Only file that imports the postgres driver. Swap DB/driver/host = change this file only.

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

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

// db.ts connects as the `postgres` role, which owns `items` and bypasses RLS.
// Impersonating `authenticated` (a role `postgres` is a member of, with no
// bypass) inside a transaction makes the `items_user_isolation` policy
// actually apply, so RLS is a real second layer under the where-clause below,
// not just schema decoration.
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
  const [conversation] = await sql<Conversation[]>`
    insert into conversations (id, user_id, title)
    values (${id}, ${userId}, ${title})
    returning *
  `;
  return conversation;
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  return sql<Conversation[]>`
    select * from conversations
    where user_id = ${userId}
    order by created_at desc
  `;
}

export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  const [conversation] = await sql<Conversation[]>`
    select * from conversations
    where id = ${id} and user_id = ${userId}
  `;
  return conversation ?? null;
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  // messages rows cascade via the ON DELETE CASCADE FK on messages.conversation_id.
  await sql`
    delete from conversations
    where id = ${id} and user_id = ${userId}
  `;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return sql<Message[]>`
    select * from messages
    where conversation_id = ${conversationId}
    order by created_at asc
  `;
}

export async function addMessage(conversationId: string, role: "user" | "assistant", content: string): Promise<Message> {
  const [message] = await sql<Message[]>`
    insert into messages (conversation_id, role, content)
    values (${conversationId}, ${role}, ${content})
    returning *
  `;
  return message;
}
