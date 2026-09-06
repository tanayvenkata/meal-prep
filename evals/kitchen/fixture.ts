import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { context, propagation, SpanStatusCode, trace } from "@opentelemetry/api";
import type { createPantryItem } from "../../src/lib/kitchen-service";

export const LOCAL_APP_DATABASE = "postgresql://mise_app:mise_app_local@127.0.0.1:54322/postgres";
const LOCAL_ADMIN_DATABASE = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Synthetic identities and loopback only. Never inherit a production database. */
export async function kitchenFixture(overrides: { createPantryItem?: typeof createPantryItem } = {}) {
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
    ...overrides,
    verifyAccessToken: async (presented) => {
      if (presented !== token) throw new Error("Invalid fixture token");
      return { token, clientId: "kitchen-eval", scopes: ["openid"],
        expiresAt: Math.floor(Date.now() / 1000) + 3600, extra: { userId } };
    },
  });
  const client = new Client({ name: "mise-kitchen-eval", version: "1.0.0" });
  const calls: Array<{ name: string; arguments: Record<string, unknown>; durationMs: number; result: unknown; traceId: string }> = [];
  async function close() {
    try {
      try { await client.close(); }
      finally { if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    } finally {
      try {
        await admin`delete from kitchen_tools where user_id=${userId}`;
        await admin`delete from items where user_id=${userId}`;
        await admin`delete from auth.users where id=${userId}`;
      } finally { await admin.end(); }
    }
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
    const url = `http://127.0.0.1:${address.port}/mcp`;
    await client.connect(new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: (url, init) => {
        const carrier: Record<string, string> = {};
        propagation.inject(context.active(), carrier);
        const headers = new Headers(init?.headers);
        for (const [name, value] of Object.entries(carrier)) headers.set(name, value);
        return fetch(url, { ...init, headers });
      },
    }));
    return {
      client, calls, close,
      async inspect(method: "initialize" | "tools/list" | "tools/call", name?: string, args: Record<string, unknown> = {}) {
        // Only this random loopback fixture credential is passed to Inspector.
        // Async execution keeps the local HTTP server available to the child.
        const { stdout } = await promisify(execFile)("npx", ["--yes", "@modelcontextprotocol/inspector@2.5.0", "--cli", url,
          "--transport", "http", "--method", method, "--format", "json", "--stored-auth-only", "--header", `Authorization: Bearer ${token}`,
          ...(name ? ["--tool-name", name, "--tool-args-json", JSON.stringify(args)] : [])], { timeout: 60_000, maxBuffer: 1024 * 1024 });
        return JSON.parse(stdout).result;
      },
      async call(name: string, args: Record<string, unknown> = {}) {
        return trace.getTracer("mise.eval", "1").startActiveSpan("eval.tool.call", async span => {
          const start = performance.now();
          let result: unknown;
          try {
            result = await client.callTool({ name, arguments: args });
            return result as Awaited<ReturnType<typeof client.callTool>>;
          } catch (error) {
            result = { transportError: true };
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            calls.push({ name, arguments: args, durationMs: performance.now() - start, result, traceId: span.spanContext().traceId });
            span.end();
          }
        });
      },
      async state() {
        const pantry = await admin`select id, name, quantity, quantity_text, quantity_value, quantity_unit from items where user_id=${userId} order by name`;
        const equipment = await admin`select id, name, kind from kitchen_tools where user_id=${userId} order by name`;
        return { pantry: [...pantry], equipment: [...equipment] };
      },
    };
  } catch (error) { await close(); throw error; }
}
