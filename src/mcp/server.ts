import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import {
  getMcpAuthChallenge,
  getMcpAuthConfig,
  getSupabaseOAuthMetadata,
  verifyMcpAccessToken,
  MCP_SCOPES,
} from "./auth";
import { kitchenWidgetResource as generatedKitchenWidgetResource } from "./kitchen-widget.generated";
import { getKitchenContext } from "@/lib/kitchen-service";
import type { KitchenWidgetResource } from "./build-widget";

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

class OpenAiCompatibleWebStandardStreamableHTTPServerTransport extends WebStandardStreamableHTTPServerTransport {
  override send(
    message: JSONRPCMessage,
    options?: Parameters<WebStandardStreamableHTTPServerTransport["send"]>[1],
  ) {
    return super.send(addOpenAiToolSecuritySchemes(message), options);
  }
}

export async function createMiseServer(
  kitchenWidgetResource: KitchenWidgetResource =
    generatedKitchenWidgetResource,
) {
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

      const kitchenContext = await getKitchenContext(userId);
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
  kitchenWidgetResource?: KitchenWidgetResource;
};

function invalidTokenResponse(authConfig = getMcpAuthConfig()) {
  return Response.json(
    { error: "invalid_token" },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": getMcpAuthChallenge(authConfig, {
          error: "invalid_token",
          errorDescription: "The Mise access token is invalid or expired.",
        }),
      },
    },
  );
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? undefined;
}

export async function handleMiseMcpRequest(
  request: Request,
  {
    verifyAccessToken = verifyMcpAccessToken,
  }: Pick<MiseHttpServerOptions, "verifyAccessToken"> = {},
) {
  const startedAt = performance.now();
  const requestId = randomUUID();
  const authConfig = getMcpAuthConfig();
  const bearerToken = getBearerToken(request);

  if (bearerToken === null) {
    const response = Response.json(
      { error: "authorization_required" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": getMcpAuthChallenge(authConfig, { error: null }),
        },
      },
    );
    console.info(JSON.stringify({
      event: "mcp_request",
      requestId,
      method: request.method,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return response;
  }

  if (bearerToken === undefined) {
    return invalidTokenResponse(authConfig);
  }

  let authInfo: AuthInfo;
  try {
    authInfo = await verifyAccessToken(bearerToken);
    const hasRequiredScopes = MCP_SCOPES.every((scope) =>
      authInfo.scopes.includes(scope)
    );
    if (
      !hasRequiredScopes
      || typeof authInfo.expiresAt !== "number"
      || authInfo.expiresAt <= Date.now() / 1000
    ) {
      throw new Error("Token policy check failed.");
    }
  } catch (error) {
    console.warn(JSON.stringify({
      event: "mcp_auth_failed",
      requestId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    }));
    return invalidTokenResponse(authConfig);
  }

  const server = await createMiseServer();
  const transport =
    new OpenAiCompatibleWebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { authInfo });
    console.info(JSON.stringify({
      event: "mcp_request",
      requestId,
      method: request.method,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return response;
  } catch (error) {
    console.error(JSON.stringify({
      event: "mcp_request_failed",
      requestId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    }));
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error." },
        id: null,
      },
      { status: 500 },
    );
  }
}

export function createMiseHttpServer({
  verifyAccessToken = verifyMcpAccessToken,
  kitchenWidgetResource = generatedKitchenWidgetResource,
}: MiseHttpServerOptions = {}) {
  const authConfig = getMcpAuthConfig();
  const app = createMcpExpressApp({
    host: "0.0.0.0",
    allowedHosts: [
      authConfig.resource.hostname,
      "localhost",
      "127.0.0.1",
      // SDK hostHeaderValidation uses URL.hostname (unbracketed IPv6).
      "::1",
    ],
  });
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(
    authConfig.resource,
  );
  const tokenVerifier: OAuthTokenVerifier = {
    async verifyAccessToken(token) {
      try {
        return await verifyAccessToken(token);
      } catch (error) {
        console.warn("MCP authentication failed:", error);
        throw new InvalidTokenError(
          "The Mise access token is invalid or expired.",
        );
      }
    },
  };

  // A plain browser/curl health check, separate from MCP itself.
  app.get("/", (_req, res) => {
    res.type("text").send("Mise MCP server");
  });

  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata: getSupabaseOAuthMetadata(authConfig),
      resourceServerUrl: authConfig.resource,
      scopesSupported: MCP_SCOPES,
      resourceName: "Mise",
    }),
  );

  // RFC 6750 says a first request with no credentials should advertise login
  // without calling the missing token an invalid token. The SDK handles every
  // presented bearer token after this small discovery compatibility check.
  app.post(MCP_PATH, (req, res, next) => {
    if (req.headers.authorization) {
      next();
      return;
    }

    res
      .set(
        "WWW-Authenticate",
        getMcpAuthChallenge(authConfig, { error: null }),
      )
      .status(401)
      .json({ error: "authorization_required" });
  });
  app.post(
    MCP_PATH,
    requireBearerAuth({
      verifier: tokenVerifier,
      requiredScopes: MCP_SCOPES,
      resourceMetadataUrl,
    }),
  );

  app.post(MCP_PATH, async (req, res) => {
    // This server is deliberately stateless: every MCP request gets a
    // short-lived server and transport.
    const server = await createMiseServer(kitchenWidgetResource);
    const transport = new OpenAiCompatibleStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!res.headersSent) res.status(500).send("Internal server error");
    }
  });

  // Streamable HTTP clients may probe with GET, but this server intentionally
  // has no resumable stream because each POST uses a short-lived transport.
  app.all(MCP_PATH, (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  return createServer(app);
}
