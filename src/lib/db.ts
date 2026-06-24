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
