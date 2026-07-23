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
import {
  adjustPantryItemQuantities as adjustPantryQuantities,
  adjustPantryItemQuantity as adjustPantryQuantity,
  getKitchenContext as loadKitchenContext,
  setPantryItemQuantity as updatePantryItemQuantity,
  type AdjustPantryItemQuantityBatchOutcome,
  type AdjustPantryItemQuantityOutcome,
} from "@/lib/kitchen-service";
import { PANTRY_QUANTITY_UNITS } from "@/lib/pantry-quantity";
import type { KitchenWidgetResource } from "./build-widget";

const MCP_PATH = "/mcp";
const KITCHEN_CONTEXT_TOOL = "get_kitchen_context";
const SET_PANTRY_ITEM_QUANTITY_TOOL = "set_pantry_item_quantity";
const CONSUME_PANTRY_ITEM_TOOL = "consume_pantry_item";
const RESTOCK_PANTRY_ITEM_TOOL = "restock_pantry_item";
const APPLY_PANTRY_ADJUSTMENTS_TOOL = "apply_pantry_adjustments";
const MISE_OAUTH_SECURITY_SCHEMES = [
  { type: "oauth2", scopes: MCP_SCOPES },
];
const AUTHENTICATED_MISE_TOOLS = new Set([
  KITCHEN_CONTEXT_TOOL,
  SET_PANTRY_ITEM_QUANTITY_TOOL,
  CONSUME_PANTRY_ITEM_TOOL,
  RESTOCK_PANTRY_ITEM_TOOL,
  APPLY_PANTRY_ADJUSTMENTS_TOOL,
]);
const LEGACY_KITCHEN_WIDGET_URIS = [
  // Historical ChatGPT messages can re-read the resource URI captured in their
  // original tool result. Keep these aliases until production evidence shows
  // those retries no longer need compatibility support.
  "ui://widget/kitchen-context-v1.html",
  "ui://widget/kitchen-context-v2.html",
  "ui://widget/kitchen-context-v3.html",
  "ui://widget/kitchen-context-v4.html",
] as const;

type KitchenContext = Awaited<ReturnType<typeof loadKitchenContext>>;
type KitchenContextLoader = (userId: string) => Promise<KitchenContext>;
type PantryQuantityUpdater = typeof updatePantryItemQuantity;
type PantryQuantityAdjuster = typeof adjustPantryQuantity;
type PantryQuantityBatchAdjuster = typeof adjustPantryQuantities;

type MiseServerOptions = {
  kitchenWidgetResource?: KitchenWidgetResource;
  loadKitchenContext?: KitchenContextLoader;
  setPantryItemQuantity?: PantryQuantityUpdater;
  adjustPantryItemQuantity?: PantryQuantityAdjuster;
  adjustPantryItemQuantities?: PantryQuantityBatchAdjuster;
};

const kitchenContextSchema = z.object({
  pantry: z.array(
    z.object({
      name: z.string(),
      quantity: z.string(),
      quantityMode: z.enum([
        "unknown",
        "text",
        "structured",
        "unsupported",
      ]),
      quantityAmount: z.string().nullable(),
      quantityUnit: z.string().nullable(),
      turnover: z.enum(["high", "low"]),
    }),
  ),
  tools: z.array(
    z.object({ name: z.string(), kind: z.string() }),
  ),
});

const setPantryItemQuantityInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quantity: z.string().trim().min(1).max(100),
}).strict();

const setPantryItemQuantityOutputSchema = z.object({
  status: z.enum(["updated", "unchanged", "not_found"]),
  name: z.string(),
  beforeQuantity: z.string().optional(),
  quantity: z.string().optional(),
});

const canonicalPantryAmountSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/,
  "Use a canonical nonnegative decimal no greater than 999999999.999999.",
);

const structuredPantryQuantitySchema = z.object({
  mode: z.literal("structured"),
  amount: canonicalPantryAmountSchema,
  unit: z.enum(PANTRY_QUANTITY_UNITS),
  text: z.null(),
}).strict();

const expectedPantryQuantityInputSchema = z.object({
  amount: canonicalPantryAmountSchema.describe(
    "Exact nonnegative decimal amount from Mise structured quantity data.",
  ),
  unit: z.enum(PANTRY_QUANTITY_UNITS).describe(
    "Canonical Mise quantity unit. Use count explicitly for counts.",
  ),
}).strict();

const deltaPantryQuantityInputSchema = z.object({
  amount: canonicalPantryAmountSchema.regex(
    /[1-9]/,
    "The adjustment amount must be greater than zero.",
  ).describe("Exact positive decimal amount to consume or restock."),
  unit: z.enum(PANTRY_QUANTITY_UNITS).describe(
    "Canonical Mise quantity unit. Use count explicitly for counts.",
  ),
}).strict();

const adjustPantryItemQuantityInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  expectedQuantity: expectedPantryQuantityInputSchema.describe(
    "Current structured quantity returned by get_kitchen_context.",
  ),
  deltaQuantity: deltaPantryQuantityInputSchema.describe(
    "Positive same-unit quantity to consume or restock.",
  ),
}).strict();

const adjustPantryItemQuantityOutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("applied"),
    operation: z.enum(["consume", "restock"]),
    name: z.string(),
    beforeQuantity: z.string(),
    quantity: z.string(),
    before: structuredPantryQuantitySchema,
    delta: structuredPantryQuantitySchema,
    after: structuredPantryQuantitySchema,
  }).strict(),
  z.object({
    status: z.literal("not_found"),
    name: z.string(),
  }).strict(),
  z.object({
    status: z.literal("unsupported_quantity"),
    name: z.string(),
    currentQuantity: z.string(),
  }).strict(),
  z.object({
    status: z.literal("conflict"),
    name: z.string(),
    expected: structuredPantryQuantitySchema,
    current: structuredPantryQuantitySchema,
  }).strict(),
  z.object({
    status: z.literal("unit_mismatch"),
    name: z.string(),
    expectedUnit: z.enum(PANTRY_QUANTITY_UNITS),
    deltaUnit: z.enum(PANTRY_QUANTITY_UNITS),
  }).strict(),
  z.object({
    status: z.literal("insufficient_quantity"),
    name: z.string(),
    current: structuredPantryQuantitySchema,
    delta: structuredPantryQuantitySchema,
  }).strict(),
  z.object({
    status: z.literal("amount_exceeded"),
    name: z.string(),
    current: structuredPantryQuantitySchema,
    delta: structuredPantryQuantitySchema,
  }).strict(),
]);

// McpServer.registerTool requires an object-shaped root schema. Nesting the
// discriminated outcome preserves an exact per-status contract.
const adjustPantryItemQuantityOutputSchema = z.object({
  outcome: adjustPantryItemQuantityOutcomeSchema,
}).strict();

const adjustPantryItemQuantityBatchInputSchema = z.object({
  changes: z.array(
    z.object({
      name: z.string().trim().min(1).max(100),
      operation: z.enum(["consume", "restock"]),
      expectedQuantity: expectedPantryQuantityInputSchema.describe(
        "Current structured quantity returned by get_kitchen_context.",
      ),
      deltaQuantity: deltaPantryQuantityInputSchema.describe(
        "Positive same-unit quantity to consume or restock.",
      ),
    }).strict(),
  ).min(1).max(25),
}).strict();

const indexedPantryAdjustmentFailureFields = {
  index: z.number().int().min(0).max(24),
  name: z.string(),
};
const adjustPantryItemQuantityBatchFailureSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      ...indexedPantryAdjustmentFailureFields,
      status: z.literal("duplicate_target"),
      duplicateIndexes: z.array(z.number().int().min(0).max(24)).min(2),
    }).strict(),
    z.object({
      ...indexedPantryAdjustmentFailureFields,
      status: z.literal("not_found"),
    }).strict(),
    z.object({
      ...indexedPantryAdjustmentFailureFields,
      status: z.literal("unsupported_quantity"),
      currentQuantity: z.string(),
    }).strict(),
    z.object({
      ...indexedPantryAdjustmentFailureFields,
      status: z.literal("conflict"),
      expected: structuredPantryQuantitySchema,
      current: structuredPantryQuantitySchema,
    }).strict(),
    z.object({
      ...indexedPantryAdjustmentFailureFields,
      status: z.literal("unit_mismatch"),
      expectedUnit: z.enum(PANTRY_QUANTITY_UNITS),
      deltaUnit: z.enum(PANTRY_QUANTITY_UNITS),
    }).strict(),
    z.object({
      ...indexedPantryAdjustmentFailureFields,
      status: z.literal("insufficient_quantity"),
      current: structuredPantryQuantitySchema,
      delta: structuredPantryQuantitySchema,
    }).strict(),
    z.object({
      ...indexedPantryAdjustmentFailureFields,
      status: z.literal("amount_exceeded"),
      current: structuredPantryQuantitySchema,
      delta: structuredPantryQuantitySchema,
    }).strict(),
  ],
);

const adjustPantryItemQuantityBatchOutcomeSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("applied"),
      changes: z.array(
        z.object({
          index: z.number().int().min(0).max(24),
          operation: z.enum(["consume", "restock"]),
          name: z.string(),
          beforeQuantity: z.string(),
          quantity: z.string(),
          before: structuredPantryQuantitySchema,
          delta: structuredPantryQuantitySchema,
          after: structuredPantryQuantitySchema,
        }).strict(),
      ).min(1).max(25),
    }).strict(),
    z.object({
      status: z.literal("rejected"),
      failures: z.array(
        adjustPantryItemQuantityBatchFailureSchema,
      ).min(1).max(25),
    }).strict(),
  ],
);

const adjustPantryItemQuantityBatchOutputSchema = z.object({
  outcome: adjustPantryItemQuantityBatchOutcomeSchema,
}).strict();

function formatStructuredToolQuantity(
  quantity: Extract<
    AdjustPantryItemQuantityOutcome,
    { status: "conflict" }
  >["current"],
) {
  return `${quantity.amount} ${quantity.unit}`;
}

function narratePantryAdjustmentBatch(
  outcome: AdjustPantryItemQuantityBatchOutcome,
): string {
  if (outcome.status === "applied") {
    const count = outcome.changes.length;
    return `Applied ${count} pantry ${count === 1 ? "change" : "changes"} atomically.`;
  }

  const failures = outcome.failures
    .slice(0, 3)
    .map(({ name, status }) => `${name}: ${status.replaceAll("_", " ")}`)
    .join("; ");
  const remainder = outcome.failures.length > 3
    ? `; plus ${outcome.failures.length - 3} more`
    : "";
  return `No pantry changes were applied. Review ${failures}${remainder}.`;
}

function narratePantryAdjustment(
  outcome: AdjustPantryItemQuantityOutcome,
): string {
  switch (outcome.status) {
    case "applied":
      return outcome.operation === "consume"
        ? `Consumed ${formatStructuredToolQuantity(outcome.delta)} from ${outcome.name}. Quantity is now ${outcome.quantity}.`
        : `Restocked ${outcome.name} by ${formatStructuredToolQuantity(outcome.delta)}. Quantity is now ${outcome.quantity}.`;
    case "not_found":
      return `No pantry item matched ${outcome.name}. Nothing changed.`;
    case "unsupported_quantity":
      return `${outcome.name} has an unsupported quantity (${outcome.currentQuantity || "unknown"}). Set an exact structured quantity first.`;
    case "conflict":
      return `${outcome.name} is now ${formatStructuredToolQuantity(outcome.current)}. Refresh kitchen context before retrying. Nothing changed.`;
    case "unit_mismatch":
      return `Expected ${outcome.expectedUnit}, but the change uses ${outcome.deltaUnit}. Nothing changed.`;
    case "insufficient_quantity":
      return `${outcome.name} has ${formatStructuredToolQuantity(outcome.current)}, less than the requested ${formatStructuredToolQuantity(outcome.delta)}. Nothing changed.`;
    case "amount_exceeded":
      return `Restocking ${outcome.name} by ${formatStructuredToolQuantity(outcome.delta)} would exceed the quantity limit. Nothing changed.`;
  }
}

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
        if (
          !isRecord(tool) ||
          typeof tool.name !== "string" ||
          !AUTHENTICATED_MISE_TOOLS.has(tool.name)
        ) {
          return tool;
        }

        const meta = isRecord(tool._meta) ? tool._meta : {};
        return {
          ...tool,
          securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
          _meta: {
            ...meta,
            securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
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
  {
    kitchenWidgetResource = generatedKitchenWidgetResource,
    loadKitchenContext: getKitchenContext = loadKitchenContext,
    setPantryItemQuantity = updatePantryItemQuantity,
    adjustPantryItemQuantity = adjustPantryQuantity,
    adjustPantryItemQuantities = adjustPantryQuantities,
  }: MiseServerOptions = {},
) {
  const kitchenWidgetUris = [
    ...LEGACY_KITCHEN_WIDGET_URIS,
    kitchenWidgetResource.uri,
  ];
  const server = new McpServer(
    { name: "mise", version: "0.1.0" },
    {
      instructions:
        "Read get_kitchen_context before consume, restock, or apply_pantry_adjustments so expectations use fresh structured values. Use apply_pantry_adjustments once for a clearly requested current-turn list; never infer writes from meal planning. Counts use count. On rejection or conflict, reread before retrying. Exact set requires a clear exact request. Never create items implicitly.",
    },
  );

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
                ui: {
                  prefersBorder: true,
                  csp: {
                    connectDomains: [],
                    resourceDomains: [],
                  },
                },
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
      description:
        "Use this when the user asks what ingredients or kitchen equipment they have, or when cooking advice should account for their saved Mise kitchen. Returns only the signed-in user's pantry and kitchen tools.",
      outputSchema: kitchenContextSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
        ui: { resourceUri: kitchenWidgetResource.uri },
        "openai/outputTemplate": kitchenWidgetResource.uri,
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

  server.registerTool(
    SET_PANTRY_ITEM_QUANTITY_TOOL,
    {
      title: "Set pantry item quantity",
      description:
        "Use this when the user wants to set the exact quantity of one pantry item that already exists in their Mise kitchen. Matches the signed-in user's pantry by normalized item name; it never creates, renames, or deletes an item.",
      inputSchema: setPantryItemQuantityInputSchema,
      outputSchema: setPantryItemQuantityOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Updating pantry quantity…",
        "openai/toolInvocation/invoked": "Pantry quantity checked.",
      },
    },
    async ({ name, quantity }, extra) => {
      const userId = extra.authInfo?.extra?.userId;
      if (typeof userId !== "string") {
        return {
          isError: true,
          content: [{ type: "text", text: "Connect your Mise account to continue." }],
          _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
        };
      }

      const result = await setPantryItemQuantity(userId, { name, quantity });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }

      const outcome = result.value;
      let text: string;
      switch (outcome.status) {
        case "updated":
          text = `Set ${outcome.name} from ${outcome.beforeQuantity} to ${outcome.quantity}.`;
          break;
        case "unchanged":
          text = `${outcome.name} is already set to ${outcome.quantity}.`;
          break;
        case "not_found":
          text = `No existing pantry item matched ${outcome.name}. Nothing changed.`;
          break;
      }

      return {
        content: [{ type: "text", text }],
        structuredContent: outcome,
      };
    },
  );

  for (const tool of [
    {
      name: CONSUME_PANTRY_ITEM_TOOL,
      operation: "consume" as const,
      title: "Consume pantry item",
      description:
        "Use this when the user clearly says in the current turn that they used or consumed a positive quantity of one existing pantry item. First read get_kitchen_context, then pass its explicit structured value as expectedQuantity and an explicit same-unit quantity to subtract. Counts must include count. Never use for meal planning or inferred consumption.",
      destructiveHint: true,
      invoking: "Consuming pantry quantity…",
      invoked: "Pantry consumption checked.",
    },
    {
      name: RESTOCK_PANTRY_ITEM_TOOL,
      operation: "restock" as const,
      title: "Restock pantry item",
      description:
        "Use this when the user clearly says in the current turn that they added or restocked a positive quantity of one existing pantry item. First read get_kitchen_context, then pass its explicit structured value as expectedQuantity and an explicit same-unit quantity to add. Counts must include count. Never create an item or infer a restock.",
      destructiveHint: false,
      invoking: "Restocking pantry quantity…",
      invoked: "Pantry restock checked.",
    },
  ]) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: adjustPantryItemQuantityInputSchema,
        outputSchema: adjustPantryItemQuantityOutputSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: tool.destructiveHint,
          idempotentHint: false,
          openWorldHint: false,
        },
        _meta: {
          securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
          "openai/toolInvocation/invoking": tool.invoking,
          "openai/toolInvocation/invoked": tool.invoked,
        },
      },
      async ({ name, expectedQuantity, deltaQuantity }, extra) => {
        const userId = extra.authInfo?.extra?.userId;
        if (typeof userId !== "string") {
          return {
            isError: true,
            content: [{
              type: "text",
              text: "Connect your Mise account to continue.",
            }],
            _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
          };
        }

        const result = await adjustPantryItemQuantity(userId, {
          name,
          operation: tool.operation,
          expectedQuantity:
            `${expectedQuantity.amount} ${expectedQuantity.unit}`,
          deltaQuantity: `${deltaQuantity.amount} ${deltaQuantity.unit}`,
        });
        if (!result.ok) {
          return {
            isError: true,
            content: [{ type: "text", text: result.error }],
          };
        }

        return {
          content: [{
            type: "text",
            text: narratePantryAdjustment(result.value),
          }],
          structuredContent: { outcome: result.value },
        };
      },
    );
  }

  server.registerTool(
    APPLY_PANTRY_ADJUSTMENTS_TOOL,
    {
      title: "Apply pantry adjustments",
      description:
        "Use this when the user clearly requests in the current turn a confirmed list of two or more existing pantry quantities to consume or restock together. First read get_kitchen_context, then pass each fresh structured quantity as expectedQuantity and an explicit same-unit delta. The whole list applies atomically or nothing changes. Never use for meal planning, inferred consumption, item creation, or unit conversion.",
      inputSchema: adjustPantryItemQuantityBatchInputSchema,
      outputSchema: adjustPantryItemQuantityBatchOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Applying pantry changes…",
        "openai/toolInvocation/invoked": "Pantry changes checked.",
      },
    },
    async ({ changes }, extra) => {
      const userId = extra.authInfo?.extra?.userId;
      if (typeof userId !== "string") {
        return {
          isError: true,
          content: [{
            type: "text",
            text: "Connect your Mise account to continue.",
          }],
          _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
        };
      }

      const result = await adjustPantryItemQuantities(userId, {
        changes: changes.map((change) => ({
          name: change.name,
          operation: change.operation,
          expectedQuantity:
            `${change.expectedQuantity.amount} ${change.expectedQuantity.unit}`,
          deltaQuantity:
            `${change.deltaQuantity.amount} ${change.deltaQuantity.unit}`,
        })),
      });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }

      return {
        content: [{
          type: "text",
          text: narratePantryAdjustmentBatch(result.value),
        }],
        structuredContent: { outcome: result.value },
      };
    },
  );

  return server;
}

type VerifyAccessToken = (token: string) => Promise<AuthInfo>;

type MiseHttpServerOptions = {
  verifyAccessToken?: VerifyAccessToken;
  kitchenWidgetResource?: KitchenWidgetResource;
  loadKitchenContext?: KitchenContextLoader;
  setPantryItemQuantity?: PantryQuantityUpdater;
  adjustPantryItemQuantity?: PantryQuantityAdjuster;
  adjustPantryItemQuantities?: PantryQuantityBatchAdjuster;
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
    loadKitchenContext: getKitchenContext = loadKitchenContext,
    setPantryItemQuantity = updatePantryItemQuantity,
    adjustPantryItemQuantity = adjustPantryQuantity,
    adjustPantryItemQuantities = adjustPantryQuantities,
  }: Pick<
    MiseHttpServerOptions,
    | "verifyAccessToken"
    | "loadKitchenContext"
    | "setPantryItemQuantity"
    | "adjustPantryItemQuantity"
    | "adjustPantryItemQuantities"
  > = {},
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

  const server = await createMiseServer({
    loadKitchenContext: getKitchenContext,
    setPantryItemQuantity,
    adjustPantryItemQuantity,
    adjustPantryItemQuantities,
  });
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
  loadKitchenContext: getKitchenContext = loadKitchenContext,
  setPantryItemQuantity = updatePantryItemQuantity,
  adjustPantryItemQuantity = adjustPantryQuantity,
  adjustPantryItemQuantities = adjustPantryQuantities,
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
    const server = await createMiseServer({
      kitchenWidgetResource,
      loadKitchenContext: getKitchenContext,
      setPantryItemQuantity,
      adjustPantryItemQuantity,
      adjustPantryItemQuantities,
    });
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
