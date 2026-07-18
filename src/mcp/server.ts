import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = 8787;
const MCP_PATH = "/mcp";

// This is fake, safe data for our first MCP connection. It does not read Mise's
// database yet; the next slice replaces it only after authentication is designed.
const kitchenContext = {
  pantry: [
    { name: "eggs", quantity: "12", turnover: "high" },
    { name: "cumin", quantity: "1 jar", turnover: "low" },
  ],
  tools: [{ name: "Air fryer", kind: "appliance" }],
};

const kitchenContextSchema = z.object({
  pantry: z.array(
    z.object({
      name: z.string(),
      quantity: z.string(),
      turnover: z.enum(["high", "low"]),
    }),
  ),
  tools: z.array(
    z.object({ name: z.string(), kind: z.string() }),
  ),
});

function createMiseServer() {
  const server = new McpServer({ name: "mise", version: "0.1.0" });

  server.registerTool(
    "get_kitchen_context",
    {
      description: "Returns the user's pantry and kitchen tools for cooking suggestions.",
      outputSchema: kitchenContextSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [{ type: "text", text: "Returned Mise kitchen context." }],
      structuredContent: kitchenContext,
    }),
  );

  return server;
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  // A plain browser/curl health check, separate from MCP itself.
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end("Mise MCP server");
    return;
  }

  if (url.pathname !== MCP_PATH) {
    res.writeHead(404).end("Not Found");
    return;
  }

  // This first server is deliberately stateless: every MCP request gets a
  // short-lived server and transport. Streamable HTTP clients send GET while
  // probing for a stream, which this stateless version does not provide.
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" }).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
    return;
  }

  const server = createMiseServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) res.writeHead(500).end("Internal server error");
  }
});

httpServer.listen(PORT, () => {
  console.log(`Mise MCP server: http://localhost:${PORT}${MCP_PATH}`);
});
