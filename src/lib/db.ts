// src/lib/db.ts — THE BOUNDARY (database edition).
//
// This is the ONLY file in the whole app that imports the `postgres` driver and
// knows the connection string. Everything else (the API route) talks to the DB
// through the functions below — never to the driver directly. Same decoupling
// lesson as ai.ts: if we ever swap Supabase for another Postgres host, change a
// driver, or add an ORM, we change THIS file and nothing else.

import postgres from "postgres";

// One connection pool for the whole app. With the connection string, the driver
// manages a pool of DB connections under the hood. DATABASE_URL comes from the
// environment (.env.local) — the password never appears in this file, on purpose.
const sql = postgres(process.env.DATABASE_URL!);
// The `!` tells TypeScript "trust me, this env var exists." If it's missing,
// the app will fail loudly at startup — which is what we want.

// Our OWN item shape. The rest of the app speaks this, not the driver's raw rows.
// Mirrors the `items` table columns we created in SQL.
export type Item = {
  id: number;
  name: string;
  quantity: string;
  created_at: string;
};

// READ — the "R" in CRUD. Returns all pantry items, newest first.
// `sql\`...\`` is a tagged template: the driver runs this exact SQL safely.
export async function getItems(): Promise<Item[]> {
  const items = await sql<Item[]>`
    select * from items
    order by created_at desc
  `;
  return items;
}

// CREATE — the "C". Inserts one item and returns the created row (so the caller
// gets the DB-generated id + created_at). `returning *` hands back the new row.
// The ${name}/${quantity} are NOT string-glued in — the driver sends them
// separately, which prevents SQL injection. THIS is the big reason to use the
// driver's tagged template instead of building the query string yourself.
export async function addItem(name: string, quantity: string): Promise<Item> {
  const [item] = await sql<Item[]>`
    insert into items (name, quantity)
    values (${name}, ${quantity})
    returning *
  `;
  return item;
}

// UPDATE — the "U". Changes one item's quantity (matched by id) and returns the
// updated row. `where id = ${id}` is how we target exactly one item — the job
// the id was created for.
export async function updateItem(id: number, quantity: string): Promise<Item> {
  const [item] = await sql<Item[]>`
    update items
    set quantity = ${quantity}
    where id = ${id}
    returning *
  `;
  return item;
}

// DELETE — the "D". Removes one item by id. Nothing to return but success.
export async function deleteItem(id: number): Promise<void> {
  await sql`
    delete from items
    where id = ${id}
  `;
}
