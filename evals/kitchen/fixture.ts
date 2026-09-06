import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const LOCAL_APP_DATABASE = "postgresql://mise_app:mise_app_local@127.0.0.1:54322/postgres";
const LOCAL_ADMIN_DATABASE = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Synthetic identities and loopback only. Never inherit a production database. */
export async function kitchenFixture() {
  if (process.env.DATABASE_URL !== LOCAL_APP_DATABASE) {
    throw new Error("Kitchen evaluations require the dedicated local mise_app database.");
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.MCP_PUBLIC_URL = "http://localhost:8787/mcp";
  const { createMiseHttpServer } = await import("../../src/mcp/server");
  const admin = postgres(LOCAL_ADMIN_DATABASE, { max: 1 });
  const userId = randomUUID();
  const token = randomUUID();
  const server = createMiseHttpServer({
    verifyAccessToken: async (presented) => {
      if (presented !== token) throw new Error("Invalid fixture token");
      return { token, clientId: "kitchen-eval", scopes: ["openid"],
        expiresAt: Math.floor(Date.now() / 1000) + 3600, extra: { userId } };
    },
  });
  const client = new Client({ name: "mise-kitchen-eval", version: "1.0.0" });
  const calls: Array<{ name: string; arguments: Record<string, unknown>; durationMs: number; result: unknown }> = [];
  async function close() {
    await client.close();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try {
      await admin`delete from kitchen_tools where user_id=${userId}`;
      await admin`delete from items where user_id=${userId}`;
      await admin`delete from auth.users where id=${userId}`;
    } finally { await admin.end(); }
  }
  try {
    await admin`insert into auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
      values(${userId},${userId + "@eval.invalid"},'x',now(),now(),now(),'{}','{}')`;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No fixture address");
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }));
    return {
      client, calls, close,
      async call(name: string, args: Record<string, unknown> = {}) {
        const start = performance.now();
        const result = await client.callTool({ name, arguments: args });
        calls.push({ name, arguments: args, durationMs: performance.now() - start, result });
        return result;
      },
      async state() {
        const pantry = await admin`select id, name, quantity, quantity_text, quantity_value, quantity_unit from items where user_id=${userId} order by name`;
        const equipment = await admin`select id, name, kind from kitchen_tools where user_id=${userId} order by name`;
        return { pantry: [...pantry], equipment: [...equipment] };
      },
    };
  } catch (error) { await close(); throw error; }
}
