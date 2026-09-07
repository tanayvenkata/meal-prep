/** Loopback-only synthetic host/Inspector fixture. Never connects to a database. */
import { createServer } from "node:http";
import { build } from "esbuild";
import { handleMiseMcpRequest } from "../../src/mcp/server";
import { inventoryHtml } from "../../src/mcp/inventory-ui/generated";
import type { KitchenSnapshot } from "../../src/mcp/inventory-ui/contract";
process.env.MISE_INVENTORY_UI = "1";
process.env.MCP_PUBLIC_URL = "http://localhost:8791/mcp";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
const fixture: KitchenSnapshot = {
  pantry: [
    { id: 1, name: "Large brown pasture eggs", quantity: "2 count", quantityMode: "structured", quantityAmount: "2", quantityUnit: "count", turnover: "high" },
    { id: 2, name: "Greek yogurt", quantity: "half a tub", quantityMode: "text", quantityAmount: null, quantityUnit: null, turnover: "high" },
    { id: 3, name: "Paprika", quantity: "", quantityMode: "unknown", quantityAmount: null, quantityUnit: null, turnover: "low" },
  ],
  tools: [{ id: "00000000-0000-4000-8000-000000000001", name: "Zojirushi rice cooker", kind: "appliance" }],
};
let mode = "stock";
const bundled = await build({ entryPoints: ["evals/inventory-card/host.ts"], bundle: true, write: false, format: "esm", platform: "browser", drop: ["console"] });
const hostJs = bundled.outputFiles[0].text;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, "http://127.0.0.1:8791");
    if (url.pathname === "/scenario" && req.method === "POST") { mode = url.searchParams.get("mode") || "stock"; res.end("ok"); return; }
    if (url.pathname === "/widget") { res.setHeader("Content-Type", "text/html"); res.end(inventoryHtml); return; }
    if (url.pathname === "/host.js") { res.setHeader("Content-Type", "text/javascript"); res.end(hostJs); return; }
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mise synthetic card test</title><style>:root{color-scheme:light}html[data-theme=dark]{color-scheme:dark}body{font:16px system-ui;max-width:720px;margin:24px auto;padding:12px}iframe{display:block;width:100%;border:1px solid GrayText;margin-top:20px}button{padding:10px;margin:4px}</style></head><body><h1>Synthetic test data — local host</h1><p id="bridge-status">Waiting for bridge…</p><button data-mode="stock">Stock fixture</button><button data-mode="empty">Empty fixture</button><button data-mode="error">Read failure</button><button id="theme">Toggle theme</button><iframe title="Mise saved kitchen"></iframe><script type="module" src="/host.js"></script></body></html>'); return;
    }
    if (url.pathname !== "/mcp" || req.method !== "POST") { res.writeHead(404).end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString();
    const message = JSON.parse(body);
    // This fixture can exercise reads/discovery only, regardless of the catalog.
    if (message.method === "tools/call" && !["show_kitchen", "read_kitchen"].includes(message.params?.name)) { res.writeHead(403).end(); return; }
    const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value);
    const result = await handleMiseMcpRequest(new Request(url, { method: "POST", headers, body }), {
      toolSurface: "four",
      loadKitchenContext: async () => { if (mode === "error") throw new Error("Synthetic failure"); return mode === "empty" ? { pantry: [], tools: [] } : fixture; },
      verifyAccessToken: async token => {
        if (token !== "synthetic-fixture") throw new Error("Invalid fixture token");
        return { token, clientId: "fixture", scopes: ["openid"], expiresAt: Date.now() / 1000 + 3600, extra: { userId: "synthetic-only" } };
      },
    });
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text());
  } catch (error) { console.error(error instanceof Error ? error.message : "Fixture failed"); res.writeHead(500).end("Fixture failed"); }
});
server.listen(8791, "127.0.0.1", () => console.log("Synthetic read-only fixture at http://127.0.0.1:8791"));
