// src/lib/db.ts — THE BOUNDARY (database edition).
// Only file that imports the postgres driver. Swap DB/driver/host = change this file only.

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

export type Item = {
  id: number;
  name: string;
  quantity: string;
  created_at: string;
  user_id: string;
};

export async function getItems(userId: string): Promise<Item[]> {
  return sql<Item[]>`
    select * from items
    where user_id = ${userId}
    order by created_at desc
  `;
}

export async function addItem(userId: string, name: string, quantity: string): Promise<Item> {
  const [item] = await sql<Item[]>`
    insert into items (user_id, name, quantity)
    values (${userId}, ${name}, ${quantity})
    returning *
  `;
  return item;
}

export async function updateItem(userId: string, id: number, quantity: string, name?: string): Promise<Item> {
  const [item] = await sql<Item[]>`
    update items
    set quantity = ${quantity}${name !== undefined ? sql`, name = ${name}` : sql``}
    where id = ${id} and user_id = ${userId}
    returning *
  `;
  return item;
}

export async function deleteItem(userId: string, id: number): Promise<void> {
  await sql`
    delete from items
    where id = ${id} and user_id = ${userId}
  `;
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
