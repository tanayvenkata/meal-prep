import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/postcss";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { build } from "esbuild";
import postcss from "postcss";
import { z } from "zod";
import {
  getMcpAuthChallenge,
  getMcpAuthConfig,
  getProtectedResourceMetadata,
  readBearerToken,
  verifyMcpAccessToken,
  MCP_SCOPES,
} from "./auth.js";
import { loadKitchenContext } from "./kitchen-context.js";

const PORT = 8787;
const MCP_PATH = "/mcp";
const KITCHEN_CONTEXT_TOOL = "get_kitchen_context";
const KITCHEN_CONTEXT_SECURITY_SCHEMES = [
  { type: "oauth2", scopes: MCP_SCOPES },
];
const LEGACY_KITCHEN_WIDGET_URIS = [
  "ui://widget/kitchen-context-v1.html",
  "ui://widget/kitchen-context-v2.html",
  "ui://widget/kitchen-context-v3.html",
  "ui://widget/kitchen-context-v4.html",
] as const;
const kitchenWidgetTemplate = readFileSync(
  new URL("./kitchen-widget.html", import.meta.url),
  "utf8",
);
const resolveWidgetImport = createRequire(
  new URL("./kitchen-widget.tsx", import.meta.url),
);
const kitchenWidgetScriptPromise = build({
  entryPoints: [
    fileURLToPath(new URL("./kitchen-widget.tsx", import.meta.url)),
  ],
  bundle: true,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  format: "iife",
  minify: true,
  platform: "browser",
  target: "es2022",
  outdir: "widget-build",
  write: false,
  plugins: [
    {
      name: "resolve-widget-packages",
      setup(build) {
        // A Yarn PnP manifest exists above this repository and would otherwise
        // override this project's node_modules resolution inside esbuild.
        build.onResolve({ filter: /^[^./]/ }, (args) => ({
          path: resolveWidgetImport.resolve(args.path),
        }));
      },
    },
  ],
}).then((result) => {
  const script = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
  const componentStyles =
    result.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
  if (!script) throw new Error("Kitchen widget bundle was not generated.");

  return { componentStyles, script };
});
const kitchenWidgetCssUrl = new URL("./kitchen-widget.css", import.meta.url);
const kitchenWidgetStylePromise = postcss([tailwindcss()])
  .process(readFileSync(kitchenWidgetCssUrl, "utf8"), {
    from: fileURLToPath(kitchenWidgetCssUrl),
  })
  .then((result) => result.css);
const kitchenWidgetResourcePromise = Promise.all([
  kitchenWidgetScriptPromise,
  kitchenWidgetStylePromise,
]).then(([bundle, styles]) => {
  const htmlWithStyles = kitchenWidgetTemplate.replace(
    "<!-- KITCHEN_WIDGET_STYLE -->",
    `${styles}\n${bundle.componentStyles}`.replaceAll("</style", "<\\/style"),
  );

  const html = htmlWithStyles.replace(
    "<!-- KITCHEN_WIDGET_SCRIPT -->",
    () =>
      `<script>${bundle.script.replaceAll("</script", "<\\/script")}</script>`,
  );
  const contentHash = createHash("sha256")
    .update(html)
    .digest("hex")
    .slice(0, 12);

  return {
    html,
    uri: `ui://widget/kitchen-context-${contentHash}.html`,
  };
});

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * OpenAI's Apps SDK requires securitySchemes at the top level of each tool
 * descriptor and mirrors it in _meta for older clients. The current MCP SDK
 * high-level registerTool helper only serializes core MCP fields, so this
 * narrow wire adapter preserves the extension until the SDK supports it.
 */
export function addOpenAiToolSecuritySchemes(message: JSONRPCMessage): JSONRPCMessage {
  if (!("result" in message) || !isRecord(message.result)) return message;

  const tools = message.result.tools;
  if (!Array.isArray(tools)) return message;

  return {
    ...message,
    result: {
      ...message.result,
      tools: tools.map((tool) => {
        if (!isRecord(tool) || tool.name !== KITCHEN_CONTEXT_TOOL) return tool;

        const meta = isRecord(tool._meta) ? tool._meta : {};
        return {
          ...tool,
          securitySchemes: KITCHEN_CONTEXT_SECURITY_SCHEMES,
          _meta: {
            ...meta,
            securitySchemes: KITCHEN_CONTEXT_SECURITY_SCHEMES,
          },
        };
      }),
    },
  } as JSONRPCMessage;
}

class OpenAiCompatibleStreamableHTTPServerTransport extends StreamableHTTPServerTransport {
  override send(
    message: JSONRPCMessage,
    options?: Parameters<StreamableHTTPServerTransport["send"]>[1],
  ) {
    return super.send(addOpenAiToolSecuritySchemes(message), options);
  }
}

export async function createMiseServer() {
  const kitchenWidgetResource = await kitchenWidgetResourcePromise;
  const kitchenWidgetUris = [
    ...LEGACY_KITCHEN_WIDGET_URIS,
    kitchenWidgetResource.uri,
  ];
  const server = new McpServer({ name: "mise", version: "0.1.0" });

  for (const [index, widgetUri] of kitchenWidgetUris.entries()) {
    registerAppResource(
      server,
      `kitchen-context-widget-v${index + 1}`,
      widgetUri,
      {},
      async () => ({
          contents: [
            {
              uri: widgetUri,
              mimeType: RESOURCE_MIME_TYPE,
              text: kitchenWidgetResource.html,
              _meta: {
                ui: { prefersBorder: true },
                "openai/widgetDescription":
                  "Displays a compact snapshot of the user's Mise kitchen context.",
              },
            },
          ],
        }),
    );
  }

  registerAppTool(
    server,
    KITCHEN_CONTEXT_TOOL,
    {
      title: "Show kitchen context",
      description: "Returns the user's pantry and kitchen tools for cooking suggestions.",
      outputSchema: kitchenContextSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: KITCHEN_CONTEXT_SECURITY_SCHEMES,
        ui: { resourceUri: kitchenWidgetResource.uri },
        "openai/toolInvocation/invoking": "Checking your kitchen…",
        "openai/toolInvocation/invoked": "Kitchen ready.",
      },
    },
    async (extra) => {
      const userId = extra.authInfo?.extra?.userId;
      if (typeof userId !== "string") {
        return {
          isError: true,
          content: [{ type: "text", text: "Connect your Mise account to continue." }],
          _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
        };
      }

      const kitchenContext = await loadKitchenContext(userId);
      return {
        content: [{ type: "text", text: "Returned your Mise kitchen context." }],
        structuredContent: kitchenContext,
      };
    },
  );

  return server;
}

type VerifyAccessToken = (token: string) => Promise<AuthInfo>;

type MiseHttpServerOptions = {
  verifyAccessToken?: VerifyAccessToken;
};

export function createMiseHttpServer({
  verifyAccessToken = verifyMcpAccessToken,
}: MiseHttpServerOptions = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // A plain browser/curl health check, separate from MCP itself.
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/plain" }).end("Mise MCP server");
      return;
    }

    const metadataPaths = new Set([
      "/.well-known/oauth-protected-resource",
      `/.well-known/oauth-protected-resource${MCP_PATH}`,
    ]);
    if (
      (req.method === "GET" || req.method === "OPTIONS") &&
      metadataPaths.has(url.pathname)
    ) {
      res
        .writeHead(200, {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        })
        .end(JSON.stringify(getProtectedResourceMetadata()));
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

    const authorizationHeader = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    const token = readBearerToken(authorizationHeader);
    if (!token) {
      res
        .writeHead(401, {
          "content-type": "application/json",
          "www-authenticate": getMcpAuthChallenge(getMcpAuthConfig(), {
            error: null,
          }),
        })
        .end(JSON.stringify({ error: "authorization_required" }));
      return;
    }

    try {
      (req as typeof req & { auth?: AuthInfo }).auth =
        await verifyAccessToken(token);
    } catch (error) {
      console.warn("MCP authentication failed:", error);
      res
        .writeHead(401, {
          "content-type": "application/json",
          "www-authenticate": getMcpAuthChallenge(getMcpAuthConfig(), {
            error: "invalid_token",
            errorDescription: "The Mise access token is invalid or expired.",
          }),
        })
        .end(JSON.stringify({ error: "invalid_token" }));
      return;
    }

    const server = await createMiseServer();
    const transport = new OpenAiCompatibleStreamableHTTPServerTransport({
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
}

if (process.env.NODE_ENV !== "test") {
  createMiseHttpServer().listen(PORT, () => {
    console.log(`Mise MCP server: ${getMcpAuthConfig().resource.href}`);
  });
}
