import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
  createMcpHandler,
  isLegacyRequest,
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type JSONRPCMessage,
  type Transport,
} from "@modelcontextprotocol/server";
import {
  createMcpExpressApp,
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
  requireBearerAuth,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/express";
import {
  NodeStreamableHTTPServerTransport,
  toNodeHandler,
  toWebRequest,
} from "@modelcontextprotocol/node";
import { z } from "zod";
import {
  getMcpAuthChallenge,
  getMcpAuthConfig,
  getSupabaseOAuthMetadata,
  verifyMcpAccessToken,
  MCP_SCOPES,
} from "./auth";
import {
  applyReviewedReceiptImport as importReviewedReceipt,
  adjustPantryItemQuantities as adjustPantryQuantities,
  adjustPantryItemQuantity as adjustPantryQuantity,
  createPantryItem as addPantryItem,
  createKitchenTool as addKitchenTool,
  deleteKitchenTool as removeKitchenTool,
  deletePantryItem as removePantryItem,
  getKitchenContext as loadKitchenContext,
  setPantryItemQuantity as updatePantryItemQuantity,
  updateKitchenTool as editKitchenTool,
  updatePantryItem as editPantryItem,
  type ApplyReviewedReceiptImportOutcome,
  type AdjustPantryItemQuantityBatchOutcome,
  type AdjustPantryItemQuantityOutcome,
} from "@/lib/kitchen-service";
import { candidateInputs } from "@/lib/kitchen-command-contract";
import { addKitchenItems, editKitchenItems, removeKitchenItems } from "@/lib/kitchen-commands";
import { PANTRY_QUANTITY_UNITS } from "@/lib/pantry-quantity";
import { ObservedMcpTransport, observeKitchenCommand, recordMcpRequest } from "./observability";

const MCP_PATH = "/mcp";
const KITCHEN_CONTEXT_TOOL = "get_kitchen_context";
const ADD_PANTRY_ITEM_TOOL = "add_pantry_item";
const UPDATE_PANTRY_ITEM_TOOL = "update_pantry_item";
const DELETE_PANTRY_ITEM_TOOL = "delete_pantry_item";
const ADD_KITCHEN_TOOL = "add_kitchen_tool";
const UPDATE_KITCHEN_TOOL = "update_kitchen_tool";
const DELETE_KITCHEN_TOOL = "delete_kitchen_tool";
const SET_PANTRY_ITEM_QUANTITY_TOOL = "set_pantry_item_quantity";
const CONSUME_PANTRY_ITEM_TOOL = "consume_pantry_item";
const RESTOCK_PANTRY_ITEM_TOOL = "restock_pantry_item";
const APPLY_PANTRY_ADJUSTMENTS_TOOL = "apply_pantry_adjustments";
const APPLY_REVIEWED_RECEIPT_IMPORT_TOOL = "apply_reviewed_receipt_import";
const MISE_OAUTH_SECURITY_SCHEMES = [
  { type: "oauth2", scopes: MCP_SCOPES },
];
const AUTHENTICATED_MISE_TOOLS = new Set([
  "read_kitchen", "add_items", "edit_items", "remove_items",
  KITCHEN_CONTEXT_TOOL,
  ADD_PANTRY_ITEM_TOOL,
  UPDATE_PANTRY_ITEM_TOOL,
  DELETE_PANTRY_ITEM_TOOL,
  ADD_KITCHEN_TOOL,
  UPDATE_KITCHEN_TOOL,
  DELETE_KITCHEN_TOOL,
  SET_PANTRY_ITEM_QUANTITY_TOOL,
  CONSUME_PANTRY_ITEM_TOOL,
  RESTOCK_PANTRY_ITEM_TOOL,
  APPLY_PANTRY_ADJUSTMENTS_TOOL,
  APPLY_REVIEWED_RECEIPT_IMPORT_TOOL,
]);

type KitchenContext = Awaited<ReturnType<typeof loadKitchenContext>>;
type KitchenContextLoader = (userId: string) => Promise<KitchenContext>;
type PantryQuantityUpdater = typeof updatePantryItemQuantity;
type PantryQuantityAdjuster = typeof adjustPantryQuantity;
type PantryQuantityBatchAdjuster = typeof adjustPantryQuantities;
type ReviewedReceiptImporter = typeof importReviewedReceipt;
type PantryItemCreator = typeof addPantryItem;
type PantryItemUpdater = typeof editPantryItem;
type PantryItemDeleter = typeof removePantryItem;
type KitchenToolCreator = typeof addKitchenTool;
type KitchenToolUpdater = typeof editKitchenTool;
type KitchenToolDeleter = typeof removeKitchenTool;

type MiseServerOptions = {
  toolSurface?: "baseline" | "four";
  addItems?: typeof addKitchenItems;
  loadKitchenContext?: KitchenContextLoader;
  setPantryItemQuantity?: PantryQuantityUpdater;
  adjustPantryItemQuantity?: PantryQuantityAdjuster;
  adjustPantryItemQuantities?: PantryQuantityBatchAdjuster;
  applyReviewedReceiptImport?: ReviewedReceiptImporter;
  createPantryItem?: PantryItemCreator;
  updatePantryItem?: PantryItemUpdater;
  deletePantryItem?: PantryItemDeleter;
  createKitchenTool?: KitchenToolCreator;
  updateKitchenTool?: KitchenToolUpdater;
  deleteKitchenTool?: KitchenToolDeleter;
};

const kitchenContextSchema = z.object({
  pantry: z.array(
    z.object({
      id: z.number().int().positive(),
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
    z.object({ id: z.uuid(), name: z.string(), kind: z.string() }),
  ),
});

const addKitchenToolInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["appliance", "cookware", "bakeware"]),
}).strict();

const kitchenToolMutationOutputSchema = z.object({
  status: z.enum(["created", "already_exists"]),
  tool: z.object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(["appliance", "cookware", "bakeware"]),
    created_at: z.string(),
  }).strict(),
}).strict();

const updateKitchenToolInputSchema = z.object({
  id: z.uuid().describe("Stable kitchen-tool ID from get_kitchen_context."),
  expectedName: z.string().trim().min(1).max(100).describe(
    "Exact current name from a fresh get_kitchen_context result.",
  ),
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["appliance", "cookware", "bakeware"]),
}).strict();

const publicKitchenToolSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(["appliance", "cookware", "bakeware"]),
  created_at: z.string(),
}).strict();

const updateKitchenToolOutputSchema = z.object({
  status: z.enum([
    "updated",
    "unchanged",
    "not_found",
    "conflict",
    "name_conflict",
  ]),
  id: z.uuid().optional(),
  tool: publicKitchenToolSchema.optional(),
  conflictingTool: publicKitchenToolSchema.optional(),
}).strict();

const deleteKitchenToolInputSchema = z.object({
  id: z.uuid().describe("Stable kitchen-tool ID from get_kitchen_context."),
  expectedName: z.string().trim().min(1).max(100).describe(
    "Exact current name from a fresh get_kitchen_context result.",
  ),
}).strict();

const deleteKitchenToolOutputSchema = z.object({
  status: z.enum(["deleted", "not_found", "conflict"]),
  id: z.uuid(),
  tool: publicKitchenToolSchema.optional(),
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

const pantryMutationItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  quantity: z.string(),
  turnover: z.enum(["high", "low"]),
  created_at: z.string(),
}).strict();

// Lifecycle writes preserve uncertainty already supported by the domain. Keep
// the original exact shape compatible; relative arithmetic remains structured.
const lifecyclePantryQuantityInputSchema = z.union([
  expectedPantryQuantityInputSchema,
  z.object({ mode: z.literal("unknown") }).strict(),
  z.object({ mode: z.literal("text"), text: z.string().trim().min(1).max(100) }).strict(),
]);

const addPantryItemInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quantity: lifecyclePantryQuantityInputSchema.optional().describe(
    "Starting quantity: prefer {amount, unit} for explicit numbers or fractions (half a jar = amount '0.5', unit 'jar'). Use {mode: 'text', text} only for unmeasured descriptions such as 'a little left', or {mode: 'unknown'}. Omit when unspecified; never invent precision.",
  ),
  turnover: z.enum(["high", "low"]).optional().describe(
    "Optional turnover classification. Defaults to high.",
  ),
}).strict();

const addPantryItemOutputSchema = z.object({
  status: z.enum(["created", "already_exists"]),
  item: pantryMutationItemSchema,
}).strict();

const updatePantryItemInputSchema = z.object({
  id: z.number().int().positive().describe(
    "Stable pantry-item ID from get_kitchen_context.",
  ),
  expectedName: z.string().trim().min(1).max(100).describe(
    "Exact current name from a fresh get_kitchen_context result.",
  ),
  name: z.string().trim().min(1).max(100).optional(),
  quantity: lifecyclePantryQuantityInputSchema.optional().describe(
    "Replacement quantity: prefer {amount, unit} for explicit numbers or fractions (half a jar = amount '0.5', unit 'jar'). Use {mode: 'text', text} for unmeasured descriptions, or {mode: 'unknown'} to clear quantity without deleting the item. Omit to leave quantity unchanged.",
  ),
  turnover: z.enum(["high", "low"]).optional(),
}).strict();

const updatePantryItemOutputSchema = z.object({
  status: z.enum([
    "updated",
    "unchanged",
    "not_found",
    "conflict",
    "name_conflict",
  ]),
  id: z.number().int().positive().optional(),
  item: pantryMutationItemSchema.optional(),
  conflictingItem: pantryMutationItemSchema.optional(),
}).strict();

const deletePantryItemInputSchema = z.object({
  id: z.number().int().positive().describe(
    "Stable pantry-item ID from get_kitchen_context.",
  ),
  expectedName: z.string().trim().min(1).max(100).describe(
    "Exact current name from a fresh get_kitchen_context result.",
  ),
}).strict();

const deletePantryItemOutputSchema = z.object({
  status: z.enum(["deleted", "not_found", "conflict"]),
  id: z.number().int().positive(),
  item: pantryMutationItemSchema.optional(),
}).strict();

const setPantryItemQuantityInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  quantity: expectedPantryQuantityInputSchema.describe(
    "Exact pantry quantity to store. Use count explicitly for discrete items.",
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

const reviewedReceiptImportInputSchema = z.object({
  requestId: z.string().uuid().describe(
    "A fresh UUID for this exact confirmed proposal. Reuse it only to retry the identical proposal.",
  ),
  lines: z.array(
    z.discriminatedUnion("decision", [
      z.object({
        decision: z.literal("create"),
        name: z.string().trim().min(1).max(100),
        quantity: deltaPantryQuantityInputSchema.describe(
          "Positive structured starting quantity for the new pantry item.",
        ),
      }).strict(),
      z.object({
        decision: z.literal("restock"),
        name: z.string().trim().min(1).max(100),
        expectedQuantity: expectedPantryQuantityInputSchema.describe(
          "Fresh structured quantity returned by get_kitchen_context.",
        ),
        deltaQuantity: deltaPantryQuantityInputSchema.describe(
          "Positive same-unit quantity to add.",
        ),
      }).strict(),
    ]),
  ).min(1).max(25),
}).strict();

const reviewedReceiptItemSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  turnover: z.enum(["high", "low"]),
}).strict();

const reviewedReceiptChangeSchema = z.discriminatedUnion("decision", [
  z.object({
    index: z.number().int().min(0).max(24),
    decision: z.literal("create"),
    item: reviewedReceiptItemSchema,
  }).strict(),
  z.object({
    index: z.number().int().min(0).max(24),
    decision: z.literal("restock"),
    item: reviewedReceiptItemSchema,
    beforeQuantity: z.string(),
    afterQuantity: z.string(),
    before: structuredPantryQuantitySchema,
    delta: structuredPantryQuantitySchema,
    after: structuredPantryQuantitySchema,
  }).strict(),
]);

const reviewedReceiptFailureFields = {
  index: z.number().int().min(0).max(24),
  name: z.string(),
};
const reviewedReceiptFailureSchema = z.discriminatedUnion("status", [
  z.object({
    ...reviewedReceiptFailureFields,
    status: z.literal("duplicate_target"),
    duplicateIndexes: z.array(z.number().int().min(0).max(24)).min(2),
  }).strict(),
  z.object({
    ...reviewedReceiptFailureFields,
    status: z.enum(["already_exists", "not_found"]),
  }).strict(),
  z.object({
    ...reviewedReceiptFailureFields,
    status: z.literal("unsupported_quantity"),
    currentDisplay: z.string(),
  }).strict(),
  z.object({
    ...reviewedReceiptFailureFields,
    status: z.literal("conflict"),
    expected: structuredPantryQuantitySchema,
    current: structuredPantryQuantitySchema,
  }).strict(),
  z.object({
    ...reviewedReceiptFailureFields,
    status: z.literal("unit_mismatch"),
    expectedUnit: z.enum(PANTRY_QUANTITY_UNITS),
    deltaUnit: z.enum(PANTRY_QUANTITY_UNITS),
  }).strict(),
  z.object({
    ...reviewedReceiptFailureFields,
    status: z.enum(["insufficient_quantity", "amount_exceeded"]),
    current: structuredPantryQuantitySchema,
    delta: structuredPantryQuantitySchema,
  }).strict(),
]);

const reviewedReceiptOutcomeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("applied"),
    requestId: z.string().uuid(),
    replayed: z.boolean(),
    changes: z.array(reviewedReceiptChangeSchema).min(1).max(25),
  }).strict(),
  z.object({
    status: z.literal("rejected"),
    requestId: z.string().uuid(),
    replayed: z.boolean(),
    failures: z.array(reviewedReceiptFailureSchema).min(1).max(25),
  }).strict(),
  z.object({
    status: z.literal("request_id_reused"),
    requestId: z.string().uuid(),
  }).strict(),
]);

const reviewedReceiptOutputSchema = z.object({
  outcome: reviewedReceiptOutcomeSchema,
}).strict();

type ToolPantryQuantity = {
  amount: string;
  unit: (typeof PANTRY_QUANTITY_UNITS)[number];
};

function toServicePantryQuantity(quantity: ToolPantryQuantity | z.infer<typeof lifecyclePantryQuantityInputSchema>) {
  if ("mode" in quantity) return quantity;
  return {
    mode: "structured" as const,
    amount: quantity.amount,
    unit: quantity.unit,
    text: null,
  };
}

function toPublicPantryItem(item: {
  id: number;
  name: string;
  quantity: string;
  turnover: "high" | "low";
  created_at: string | Date;
}) {
  const id = Number(item.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("pantry item id is outside the supported safe-integer range");
  }
  return {
    id,
    name: item.name,
    quantity: item.quantity,
    turnover: item.turnover,
    created_at: serializeTimestamp(item.created_at),
  };
}

function toPublicKitchenTool(tool: {
  id: string;
  name: string;
  kind: "appliance" | "cookware" | "bakeware";
  created_at: string | Date;
}) {
  return {
    id: tool.id,
    name: tool.name,
    kind: tool.kind,
    created_at: serializeTimestamp(tool.created_at),
  };
}

function serializeTimestamp(timestamp: string | Date): string {
  return timestamp instanceof Date ? timestamp.toISOString() : timestamp;
}

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

function narrateReviewedReceiptImport(
  outcome: ApplyReviewedReceiptImportOutcome,
): string {
  switch (outcome.status) {
    case "applied": {
      const count = outcome.changes.length;
      return outcome.replayed
        ? `This confirmed receipt import was already applied. Replayed the original ${count}-item result without changing the pantry again.`
        : `Applied ${count} reviewed receipt ${count === 1 ? "item" : "items"} atomically.`;
    }
    case "rejected": {
      const failures = outcome.failures
        .slice(0, 3)
        .map(({ name, status }) => `${name}: ${status.replaceAll("_", " ")}`)
        .join("; ");
      const remainder = outcome.failures.length > 3
        ? `; plus ${outcome.failures.length - 3} more`
        : "";
      const replay = outcome.replayed ? " Replayed the original rejection." : "";
      return `No pantry changes were applied. Review ${failures}${remainder}.${replay}`;
    }
    case "request_id_reused":
      return "This request ID was already used for a different receipt proposal. Nothing changed; use a fresh UUID.";
  }
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

function getUserIdFromContext(ctx: unknown): string | undefined {
  if (!ctx || typeof ctx !== "object") return undefined;
  const c = ctx as {
    http?: { authInfo?: AuthInfo };
    authInfo?: AuthInfo;
  };
  const userId = c.http?.authInfo?.extra?.userId ?? c.authInfo?.extra?.userId;
  return typeof userId === "string" ? userId : undefined;
}

export async function patchOpenAiSecuritySchemes(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return response;
  }
  try {
    const text = await response.text();
    const data = JSON.parse(text);
    const patched = addOpenAiToolSecuritySchemes(data);
    const patchedText = JSON.stringify(patched);
    const headers = new Headers(response.headers);
    headers.set("content-length", String(Buffer.byteLength(patchedText)));
    return new Response(patchedText, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
}

class OpenAiCompatibleNodeStreamableHTTPServerTransport extends NodeStreamableHTTPServerTransport {
  override send(
    message: JSONRPCMessage,
    options?: Parameters<NodeStreamableHTTPServerTransport["send"]>[1],
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

export function registerMisePrompts(server: McpServer) {
  server.registerPrompt(
    "plan_meal",
    {
      title: "Plan Meal",
      description:
        "Suggest 3 quick, practical meal ideas based on current kitchen inventory, defaulting to 1 serving.",
      argsSchema: {
        servings: z
          .string()
          .optional()
          .describe("Number of servings to prepare (default: 1)"),
        dietary_notes: z
          .string()
          .optional()
          .describe(
            "Dietary preferences, restrictions, or cravings (e.g. quick, high-protein, vegetarian)",
          ),
      },
    },
    async (args) => {
      const servings = args.servings?.trim() || "1";
      const notes = args.dietary_notes?.trim()
        ? ` with dietary notes: ${args.dietary_notes.trim()}`
        : "";
      return {
        description: `Plan a meal for ${servings} serving(s)`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please inspect my kitchen inventory using read_kitchen and suggest 3 quick, delicious meal ideas for ${servings} serving(s)${notes}. Prioritize high-turnover ingredients and items that should be used soonest, and let me know if any equipment or staples are needed.`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "plan_dinner",
    {
      title: "Plan Dinner",
      description:
        "Suggest 3 quick dinner ideas based on current kitchen inventory, defaulting to 1 serving.",
      argsSchema: {
        servings: z
          .string()
          .optional()
          .describe("Number of servings to prepare (default: 1)"),
        dietary_notes: z
          .string()
          .optional()
          .describe("Dietary preferences, restrictions, or cravings"),
      },
    },
    async (args) => {
      const servings = args.servings?.trim() || "1";
      const notes = args.dietary_notes?.trim()
        ? ` with dietary notes: ${args.dietary_notes.trim()}`
        : "";
      return {
        description: `Plan dinner for ${servings} serving(s)`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please check my kitchen inventory using read_kitchen and propose 3 quick dinner ideas for ${servings} serving(s)${notes}. Prioritize items near expiration or high turnover, and note if any equipment or staples are needed.`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "pantry_audit",
    {
      title: "Pantry Audit",
      description:
        "Audit kitchen inventory for low stock, missing essentials, unit inconsistencies, and cleanup opportunities.",
      argsSchema: {
        focus: z
          .string()
          .optional()
          .describe("Optional focus area (e.g. 'staples', 'spices', 'all')"),
      },
    },
    async (args) => {
      const focus = args.focus?.trim() || "all";
      return {
        description: `Pantry audit focused on ${focus}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please inspect my current kitchen inventory using read_kitchen and perform a pantry audit focused on '${focus}'. Highlight: 1) Essential staples or high-turnover items running low or missing; 2) Any inconsistencies in quantities or units; 3) Stale or unused items; and 4) Actionable suggestions for restocking or cleanup.`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "substitutions",
    {
      title: "Ingredient Substitutions",
      description:
        "Suggest pantry-available replacements for a missing recipe ingredient.",
      argsSchema: {
        missing_ingredient: z
          .string()
          .describe("The ingredient that is missing or unavailable"),
        recipe_dish: z
          .string()
          .optional()
          .describe("The recipe or dish being prepared for culinary context"),
      },
    },
    async (args) => {
      const ingredient =
        args.missing_ingredient?.trim() || "the missing ingredient";
      const dishContext = args.recipe_dish?.trim()
        ? ` while cooking ${args.recipe_dish.trim()}`
        : "";
      return {
        description: `Ingredient substitutions for ${ingredient}`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I need a substitution for '${ingredient}'${dishContext}. Please inspect my kitchen inventory using read_kitchen and recommend practical replacements using only ingredients and equipment I currently have on hand. Explain how each option affects flavor, texture, and cooking proportions.`,
            },
          },
        ],
      };
    },
  );
}

export async function createMiseServer(
  {
    toolSurface = process.env.MISE_TOOL_SURFACE === "baseline" ? "baseline" : "four",
    addItems = addKitchenItems,
    loadKitchenContext: getKitchenContext = loadKitchenContext,
    setPantryItemQuantity = updatePantryItemQuantity,
    adjustPantryItemQuantity = adjustPantryQuantity,
    adjustPantryItemQuantities = adjustPantryQuantities,
    applyReviewedReceiptImport = importReviewedReceipt,
    createPantryItem = addPantryItem,
    updatePantryItem = editPantryItem,
    deletePantryItem = removePantryItem,
    createKitchenTool = addKitchenTool,
    updateKitchenTool = editKitchenTool,
    deleteKitchenTool = removeKitchenTool,
  }: MiseServerOptions = {},
  requestId?: string,
) {
  getKitchenContext = observeKitchenCommand(KITCHEN_CONTEXT_TOOL, getKitchenContext);
  setPantryItemQuantity = observeKitchenCommand(SET_PANTRY_ITEM_QUANTITY_TOOL, setPantryItemQuantity);
  adjustPantryItemQuantity = observeKitchenCommand("adjust_pantry_item", adjustPantryItemQuantity);
  adjustPantryItemQuantities = observeKitchenCommand(APPLY_PANTRY_ADJUSTMENTS_TOOL, adjustPantryItemQuantities);
  applyReviewedReceiptImport = observeKitchenCommand(APPLY_REVIEWED_RECEIPT_IMPORT_TOOL, applyReviewedReceiptImport);
  createPantryItem = observeKitchenCommand(ADD_PANTRY_ITEM_TOOL, createPantryItem);
  updatePantryItem = observeKitchenCommand(UPDATE_PANTRY_ITEM_TOOL, updatePantryItem);
  deletePantryItem = observeKitchenCommand(DELETE_PANTRY_ITEM_TOOL, deletePantryItem);
  createKitchenTool = observeKitchenCommand(ADD_KITCHEN_TOOL, createKitchenTool);
  updateKitchenTool = observeKitchenCommand(UPDATE_KITCHEN_TOOL, updateKitchenTool);
  deleteKitchenTool = observeKitchenCommand(DELETE_KITCHEN_TOOL, deleteKitchenTool);
  const server = new McpServer(
    { name: "mise", version: "0.1.0" },
    {
      instructions: toolSurface === "four"
        ? "Read read_kitchen before edits and removals. Add named items with unknown quantity when unspecified; never require an amount merely to save an item. Writes require current-turn intent. Finished pantry items are removed. Reuse a request UUID only for an identical retry; replay reports historical effects, not current inventory. Lists are atomic. Never infer writes from planning or receipt images. Reread after rejection. Never convert units."
        : "Read get_kitchen_context before edits, deletes, relative changes, or receipt writes; use its IDs and exact names. Writes require a clear current-turn request; finished pantry items are removed. Canonical create retries are safe. Receipt images and proposals alone never authorize writes; imports require exact confirmation. Reuse a receipt UUID only for an identical retry. Counts use count. Never convert units or fuzzy-match. On rejection or conflict, reread before retrying.",
    },
  );

  const originalMcpConnect = server.connect.bind(server);
  server.connect = async (transport: Transport) => {
    const observed = transport instanceof ObservedMcpTransport
      ? transport
      : new ObservedMcpTransport(transport, AUTHENTICATED_MISE_TOOLS, requestId);
    return originalMcpConnect(observed);
  };
  const originalServerConnect = server.server.connect.bind(server.server);
  server.server.connect = async (transport: Transport) => {
    const observed = transport instanceof ObservedMcpTransport
      ? transport
      : new ObservedMcpTransport(transport, AUTHENTICATED_MISE_TOOLS, requestId);
    return originalServerConnect(observed);
  };


  server.registerTool(
    toolSurface === "four" ? "read_kitchen" : KITCHEN_CONTEXT_TOOL,
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
        "openai/toolInvocation/invoking": "Checking your kitchen…",
        "openai/toolInvocation/invoked": "Kitchen ready.",
      },
    },
    async (extra) => {
      const userId = getUserIdFromContext(extra);
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

  registerMisePrompts(server);

  if (toolSurface === "four") {
    const registerWrite = (name: "add_items" | "edit_items" | "remove_items", description: string,
      schema: z.ZodObject, command: typeof addKitchenItems) => {
      const observed = observeKitchenCommand(name, command);
      server.registerTool(name, {
        description, inputSchema: schema,
        outputSchema: z.object({
          status: z.enum(["applied", "rejected", "request_id_reused", "invalid_input"]),
          requestId: z.string().uuid().optional(),
          replayed: z.boolean().optional().describe("Historical result returned for an identical retry; reread for current state."),
          results: z.array(z.record(z.string(), z.json())).optional().describe("Per-entry applied outcomes in input order."),
          index: z.number().int().nonnegative().optional().describe("Rejected entry index; no entries in this batch committed."),
          reason: z.string().optional().describe("Domain rejection reason; reread inventory before correcting and issuing a new request."),
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: name !== "add_items", idempotentHint: true, openWorldHint: false },
        _meta: { securitySchemes: MISE_OAUTH_SECURITY_SCHEMES },
      }, async (input, extra) => {
        const userId = getUserIdFromContext(extra);
        if (typeof userId !== "string") return {
          isError: true, content: [{ type: "text" as const, text: "Connect your Mise account to continue." }],
          _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
        };
        const result = await observed(userId, input);
        return {
          isError: result.status === "invalid_input",
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      });
    };
    registerWrite("add_items", "Save one or more explicitly owned pantry items or pieces of equipment. Preserve the user-supplied name; do not expand synonyms (mayo stays mayo). A name is enough for pantry: omit quantity when unspecified, and do not ask for an amount. Food and spices default to collection pantry; specify equipment for kitchen equipment. Quantity and turnover are optional. To record a purchase of more existing pantry stock, use operation increase with a fresh item ID, expectedName, expectedQuantity, and positive same-unit delta. Mix new items and increases in one list for a confirmed receipt; all commit together. A plain named add of an existing item leaves it unchanged. Use one request UUID per requested list, reused only for an identical retry. All entries commit together or none do. Never infer ownership from recipes or an unconfirmed receipt.", candidateInputs.add_items, addItems);
    registerWrite("edit_items", "Edit saved pantry or equipment from a fresh read_kitchen result. Use replace for a stated total, description, unknown quantity, rename, or turnover change; increase for more purchased; decrease for an explicit amount consumed. Relative edits require a positive same-unit delta and fresh expected quantity. Pass stable IDs and exact current names. Lists are atomic; reuse UUID only for identical retries. Planning never authorizes an edit.", candidateInputs.edit_items, editKitchenItems);
    registerWrite("remove_items", "Remove saved pantry items or equipment explicitly requested in the current turn. A pantry item reported fully finished or used up counts as removal intent. Partial use, a stored zero alone, and hypothetical plans do not. Read read_kitchen first and use stable IDs and exact current names. If absent, confirm absence without a write. All listed removals commit together; reuse UUID only for identical retries.", candidateInputs.remove_items, removeKitchenItems);
    return server;
  }

  server.registerTool(
    ADD_PANTRY_ITEM_TOOL,
    {
      title: "Add pantry item",
      description:
        "Use this when the user clearly asks in the current turn to add one pantry item outside a receipt import. Preserve the user's exact or descriptive quantity; omit quantity when unspecified. Never invent precision. Canonical-equivalent retries return the existing item instead of creating a duplicate. Never infer an item from meal planning or discussion.",
      inputSchema: addPantryItemInputSchema,
      outputSchema: addPantryItemOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Adding pantry item…",
        "openai/toolInvocation/invoked": "Pantry item checked.",
      },
    },
    async ({ name, quantity, turnover }, extra) => {
      const userId = getUserIdFromContext(extra);
      if (typeof userId !== "string") {
        return {
          isError: true,
          content: [{ type: "text", text: "Connect your Mise account to continue." }],
          _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
        };
      }

      const result = await createPantryItem(userId, {
        name,
        ...(quantity
          ? { quantity: toServicePantryQuantity(quantity) }
          : {}),
        ...(turnover ? { turnover } : {}),
      });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }
      const outcome = {
        status: result.value.status,
        item: toPublicPantryItem(result.value.item),
      };
      return {
        content: [{
          type: "text",
          text: outcome.status === "created"
            ? `Added ${outcome.item.name} to your pantry.`
            : `${outcome.item.name} is already in your pantry.`,
        }],
        structuredContent: outcome,
      };
    },
  );

  server.registerTool(
    UPDATE_PANTRY_ITEM_TOOL,
    {
      title: "Update pantry item",
      description:
        "Use this when the user clearly asks in the current turn to rename one pantry item or replace its quantity or turnover. Quantity may be exact, descriptive, or explicitly unknown. First call get_kitchen_context and pass the stable ID plus its exact current name. Include only requested replacement fields. Never use this for relative consume/restock changes or unit conversion.",
      inputSchema: updatePantryItemInputSchema,
      outputSchema: updatePantryItemOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Updating pantry item…",
        "openai/toolInvocation/invoked": "Pantry item checked.",
      },
    },
    async ({ id, expectedName, name, quantity, turnover }, extra) => {
      const userId = getUserIdFromContext(extra);
      if (typeof userId !== "string") {
        return {
          isError: true,
          content: [{ type: "text", text: "Connect your Mise account to continue." }],
          _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
        };
      }

      const result = await updatePantryItem(userId, {
        id,
        expectedName,
        ...(name ? { name } : {}),
        ...(quantity
          ? { quantity: toServicePantryQuantity(quantity) }
          : {}),
        ...(turnover ? { turnover } : {}),
      });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }

      const value = result.value;
      const outcome = value.status === "updated" || value.status === "unchanged"
        ? { status: value.status, item: toPublicPantryItem(value.item) }
        : value.status === "conflict"
          ? { status: value.status, id: value.id, item: toPublicPantryItem(value.item) }
          : value.status === "name_conflict"
            ? {
                status: value.status,
                id: value.id,
                conflictingItem: toPublicPantryItem(value.conflictingItem),
              }
            : value;
      let text: string;
      switch (outcome.status) {
        case "updated":
          text = `Updated ${outcome.item.name}.`;
          break;
        case "unchanged":
          text = `${outcome.item.name} already has those details.`;
          break;
        case "not_found":
          text = "That pantry item no longer exists. Nothing changed.";
          break;
        case "conflict":
          text = `That pantry item is now named ${outcome.item.name}. Refresh kitchen context before retrying. Nothing changed.`;
          break;
        case "name_conflict":
          text = `${outcome.conflictingItem.name} already exists in your pantry. Nothing changed.`;
          break;
      }
      return {
        content: [{ type: "text", text }],
        structuredContent: outcome,
      };
    },
  );

  server.registerTool(
    DELETE_PANTRY_ITEM_TOOL,
    {
      title: "Delete pantry item",
      description:
        "Use this when the user in the current turn asks to remove/delete a pantry item or reports it is finished, used up, or out of stock. First read get_kitchen_context; pass the stable ID and exact current name. If absent, confirm it is not saved without deleting anything. Partial consumption, a stored zero alone, hypothetical plans, and vague cleanup do not authorize removal.",
      inputSchema: deletePantryItemInputSchema,
      outputSchema: deletePantryItemOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Deleting pantry item…",
        "openai/toolInvocation/invoked": "Pantry deletion checked.",
      },
    },
    async ({ id, expectedName }, extra) => {
      const userId = getUserIdFromContext(extra);
      if (typeof userId !== "string") {
        return {
          isError: true,
          content: [{ type: "text", text: "Connect your Mise account to continue." }],
          _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
        };
      }

      const result = await deletePantryItem(userId, { id, expectedName });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }
      const value = result.value;
      const outcome = value.status === "conflict"
        ? { status: value.status, id: value.id, item: toPublicPantryItem(value.item) }
        : value;
      const text = outcome.status === "deleted"
        ? `Deleted ${expectedName} from your pantry.`
        : outcome.status === "not_found"
          ? "That pantry item no longer exists. Nothing changed."
          : `That pantry item is now named ${outcome.item.name}. Refresh kitchen context before retrying. Nothing changed.`;
      return {
        content: [{ type: "text", text }],
        structuredContent: outcome,
      };
    },
  );

  server.registerTool(
    ADD_KITCHEN_TOOL,
    {
      title: "Add kitchen tool",
      description:
        "Use this when the user clearly asks in the current turn to save one kitchen tool in Mise. Choose exactly one kind: appliance, cookware, or bakeware. Canonical-equivalent retries return the existing tool instead of creating a duplicate. Never infer ownership or save a merely discussed tool.",
      inputSchema: addKitchenToolInputSchema,
      outputSchema: kitchenToolMutationOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Adding kitchen tool…",
        "openai/toolInvocation/invoked": "Kitchen tool checked.",
      },
    },
    async ({ name, kind }, extra) => {
      const userId = getUserIdFromContext(extra);
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

      const result = await createKitchenTool(userId, { name, kind });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }
      const outcome = {
        status: result.value.status,
        tool: toPublicKitchenTool(result.value.tool),
      };
      const text = outcome.status === "created"
        ? `Added ${outcome.tool.name} to your kitchen tools.`
        : `${outcome.tool.name} is already in your kitchen tools.`;
      return {
        content: [{ type: "text", text }],
        structuredContent: outcome,
      };
    },
  );

  server.registerTool(
    UPDATE_KITCHEN_TOOL,
    {
      title: "Update kitchen tool",
      description:
        "Use this when the user clearly asks in the current turn to rename one saved kitchen tool or change its kind. First call get_kitchen_context and pass the stable ID plus its exact current name, then provide the complete replacement name and kind. Do not infer equipment ownership from cooking discussion.",
      inputSchema: updateKitchenToolInputSchema,
      outputSchema: updateKitchenToolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Updating kitchen tool…",
        "openai/toolInvocation/invoked": "Kitchen tool checked.",
      },
    },
    async ({ id, expectedName, name, kind }, extra) => {
      const userId = getUserIdFromContext(extra);
      if (typeof userId !== "string") {
        return {
          isError: true,
          content: [{ type: "text", text: "Connect your Mise account to continue." }],
          _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
        };
      }

      const result = await updateKitchenTool(userId, {
        id,
        expectedName,
        name,
        kind,
      });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }
      const value = result.value;
      const outcome = value.status === "updated" || value.status === "unchanged"
        ? { status: value.status, tool: toPublicKitchenTool(value.tool) }
        : value.status === "conflict"
          ? { status: value.status, id: value.id, tool: toPublicKitchenTool(value.tool) }
          : value.status === "name_conflict"
            ? {
                status: value.status,
                id: value.id,
                conflictingTool: toPublicKitchenTool(value.conflictingTool),
              }
            : value;
      let text: string;
      switch (outcome.status) {
        case "updated":
          text = `Updated ${outcome.tool.name}.`;
          break;
        case "unchanged":
          text = `${outcome.tool.name} already has those details.`;
          break;
        case "not_found":
          text = "That kitchen tool no longer exists. Nothing changed.";
          break;
        case "conflict":
          text = `That kitchen tool is now named ${outcome.tool.name}. Refresh kitchen context before retrying. Nothing changed.`;
          break;
        case "name_conflict":
          text = `${outcome.conflictingTool.name} already exists in your kitchen tools. Nothing changed.`;
          break;
      }
      return {
        content: [{ type: "text", text }],
        structuredContent: outcome,
      };
    },
  );

  server.registerTool(
    DELETE_KITCHEN_TOOL,
    {
      title: "Delete kitchen tool",
      description:
        "Use this only when the user explicitly asks in the current turn to permanently delete one saved kitchen tool. First call get_kitchen_context and pass the stable ID plus its exact current name. Do not infer deletion from replacement, disuse, or vague cleanup language.",
      inputSchema: deleteKitchenToolInputSchema,
      outputSchema: deleteKitchenToolOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Deleting kitchen tool…",
        "openai/toolInvocation/invoked": "Kitchen-tool deletion checked.",
      },
    },
    async ({ id, expectedName }, extra) => {
      const userId = getUserIdFromContext(extra);
      if (typeof userId !== "string") {
        return {
          isError: true,
          content: [{ type: "text", text: "Connect your Mise account to continue." }],
          _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
        };
      }

      const result = await deleteKitchenTool(userId, { id, expectedName });
      if (!result.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: result.error }],
        };
      }
      const value = result.value;
      const outcome = value.status === "conflict"
        ? { status: value.status, id: value.id, tool: toPublicKitchenTool(value.tool) }
        : value;
      const text = outcome.status === "deleted"
        ? `Deleted ${expectedName} from your kitchen tools.`
        : outcome.status === "not_found"
          ? "That kitchen tool no longer exists. Nothing changed."
          : `That kitchen tool is now named ${outcome.tool.name}. Refresh kitchen context before retrying. Nothing changed.`;
      return {
        content: [{ type: "text", text }],
        structuredContent: outcome,
      };
    },
  );

  server.registerTool(
    SET_PANTRY_ITEM_QUANTITY_TOOL,
    {
      title: "Set pantry item quantity",
      description:
        "Use this when the user clearly states an exact measured quantity for one existing Mise pantry item. Pass an explicit decimal amount and canonical unit; counts use count. Free-text estimates are not exact quantities and must not use this tool. Matches by normalized item name and never creates, renames, deletes, or converts units.",
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
      const userId = getUserIdFromContext(extra);
      if (typeof userId !== "string") {
        return {
          isError: true,
          content: [{ type: "text", text: "Connect your Mise account to continue." }],
          _meta: { "mcp/www_authenticate": [getMcpAuthChallenge()] },
        };
      }

      const result = await setPantryItemQuantity(userId, {
        name,
        quantity: toServicePantryQuantity(quantity),
      });
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
        const userId = getUserIdFromContext(extra);
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
      const userId = getUserIdFromContext(extra);
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

  server.registerTool(
    APPLY_REVIEWED_RECEIPT_IMPORT_TOOL,
    {
      title: "Apply reviewed receipt import",
      description:
        "Use this only after the user explicitly confirms an exact receipt proposal whose every line is marked create or restock. First read get_kitchen_context; use its fresh structured value for every restock expectation. Send the full confirmed proposal once with a fresh UUID. The import applies atomically and identical retries do not add twice. Never call from an image or draft alone, infer a decision, fuzzy-match names, or convert units.",
      inputSchema: reviewedReceiptImportInputSchema,
      outputSchema: reviewedReceiptOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: MISE_OAUTH_SECURITY_SCHEMES,
        "openai/toolInvocation/invoking": "Applying reviewed receipt…",
        "openai/toolInvocation/invoked": "Receipt import checked.",
      },
    },
    async ({ requestId, lines }, extra) => {
      const userId = getUserIdFromContext(extra);
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

      const result = await applyReviewedReceiptImport(userId, {
        requestId,
        lines: lines.map((line) =>
          line.decision === "create"
            ? {
                decision: line.decision,
                name: line.name,
                quantity: `${line.quantity.amount} ${line.quantity.unit}`,
              }
            : {
                decision: line.decision,
                name: line.name,
                expectedQuantity:
                  `${line.expectedQuantity.amount} ${line.expectedQuantity.unit}`,
                deltaQuantity:
                  `${line.deltaQuantity.amount} ${line.deltaQuantity.unit}`,
              }
        ),
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
          text: narrateReviewedReceiptImport(result.value),
        }],
        structuredContent: { outcome: result.value },
      };
    },
  );


  return server;
}

type VerifyAccessToken = (token: string) => Promise<AuthInfo>;

type MiseHttpServerOptions = {
  toolSurface?: "baseline" | "four";
  addItems?: typeof addKitchenItems;
  verifyAccessToken?: VerifyAccessToken;
  loadKitchenContext?: KitchenContextLoader;
  setPantryItemQuantity?: PantryQuantityUpdater;
  adjustPantryItemQuantity?: PantryQuantityAdjuster;
  adjustPantryItemQuantities?: PantryQuantityBatchAdjuster;
  applyReviewedReceiptImport?: ReviewedReceiptImporter;
  createPantryItem?: PantryItemCreator;
  updatePantryItem?: PantryItemUpdater;
  deletePantryItem?: PantryItemDeleter;
  createKitchenTool?: KitchenToolCreator;
  updateKitchenTool?: KitchenToolUpdater;
  deleteKitchenTool?: KitchenToolDeleter;
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
    toolSurface = process.env.MISE_TOOL_SURFACE === "baseline" ? "baseline" : "four",
    addItems = addKitchenItems,
    loadKitchenContext: getKitchenContext = loadKitchenContext,
    setPantryItemQuantity = updatePantryItemQuantity,
    adjustPantryItemQuantity = adjustPantryQuantity,
    adjustPantryItemQuantities = adjustPantryQuantities,
    applyReviewedReceiptImport = importReviewedReceipt,
    createPantryItem = addPantryItem,
    updatePantryItem = editPantryItem,
    deletePantryItem = removePantryItem,
    createKitchenTool = addKitchenTool,
    updateKitchenTool = editKitchenTool,
    deleteKitchenTool = removeKitchenTool,
  }: Pick<
    MiseHttpServerOptions,
    | "verifyAccessToken"
    | "toolSurface"
    | "addItems"
    | "loadKitchenContext"
    | "setPantryItemQuantity"
    | "adjustPantryItemQuantity"
    | "adjustPantryItemQuantities"
    | "applyReviewedReceiptImport"
    | "createPantryItem"
    | "updatePantryItem"
    | "deletePantryItem"
    | "createKitchenTool"
    | "updateKitchenTool"
    | "deleteKitchenTool"
  > = {},
) {
  const startedAt = performance.now();
  const requestId = randomUUID();
  const observeResponse = (response: Response) => {
    recordMcpRequest(requestId, response.status, performance.now() - startedAt);
    return response;
  };
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
    return observeResponse(response);
  }

  if (bearerToken === undefined) {
    return observeResponse(invalidTokenResponse(authConfig));
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
  } catch {
    console.warn(JSON.stringify({
      event: "mcp_auth_failed",
      requestId,
    }));
    return observeResponse(invalidTokenResponse(authConfig));
  }

  if (await isLegacyRequest(request.clone())) {
    const server = await createMiseServer({
      toolSurface,
      addItems,
      loadKitchenContext: getKitchenContext,
      setPantryItemQuantity,
      adjustPantryItemQuantity,
      adjustPantryItemQuantities,
      applyReviewedReceiptImport,
      createPantryItem,
      updatePantryItem,
      deletePantryItem,
      createKitchenTool,
      updateKitchenTool,
      deleteKitchenTool,
    }, requestId);
    const transport =
      new OpenAiCompatibleWebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request, { authInfo });
      return observeResponse(response);
    } catch {
      console.error(JSON.stringify({
        event: "mcp_request_failed",
        requestId,
      }));
      return observeResponse(Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error." },
          id: null,
        },
        { status: 500 },
      ));
    } finally {
      await server.close();
    }
  }

  const serverOptions = {
    toolSurface,
    addItems,
    loadKitchenContext: getKitchenContext,
    setPantryItemQuantity,
    adjustPantryItemQuantity,
    adjustPantryItemQuantities,
    applyReviewedReceiptImport,
    createPantryItem,
    updatePantryItem,
    deletePantryItem,
    createKitchenTool,
    updateKitchenTool,
    deleteKitchenTool,
  };
  const modernHandler = createMcpHandler(
    () => createMiseServer(serverOptions, requestId),
    { legacy: "reject", responseMode: "auto" },
  );

  try {
    const response = await modernHandler.fetch(request, { authInfo });
    const patchedResponse = await patchOpenAiSecuritySchemes(response);
    return observeResponse(patchedResponse);
  } catch {
    console.error(JSON.stringify({
      event: "mcp_request_failed",
      requestId,
    }));
    return observeResponse(Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error." },
        id: null,
      },
      { status: 500 },
    ));
  }
}

export function createMiseHttpServer({
  verifyAccessToken = verifyMcpAccessToken,
  toolSurface = process.env.MISE_TOOL_SURFACE === "baseline" ? "baseline" : "four",
    addItems = addKitchenItems,
    loadKitchenContext: getKitchenContext = loadKitchenContext,
  setPantryItemQuantity = updatePantryItemQuantity,
  adjustPantryItemQuantity = adjustPantryQuantity,
  adjustPantryItemQuantities = adjustPantryQuantities,
  applyReviewedReceiptImport = importReviewedReceipt,
  createPantryItem = addPantryItem,
  updatePantryItem = editPantryItem,
  deletePantryItem = removePantryItem,
  createKitchenTool = addKitchenTool,
  updateKitchenTool = editKitchenTool,
  deleteKitchenTool = removeKitchenTool,
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
      } catch {
        console.warn(JSON.stringify({ event: "mcp_auth_failed" }));
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          "The Mise access token is invalid or expired.",
        );
      }
    },
  };

  app.use(MCP_PATH, (_req, res, next) => {
    const started = performance.now();
    res.locals.miseRequestId = randomUUID();
    res.on("finish", () => recordMcpRequest(res.locals.miseRequestId, res.statusCode, performance.now() - started));
    next();
  });

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
    const webRequest = await toWebRequest(req, req.body);
    if (await isLegacyRequest(webRequest, req.body)) {
      const server = await createMiseServer({
      toolSurface,
      addItems,
        loadKitchenContext: getKitchenContext,
        setPantryItemQuantity,
        adjustPantryItemQuantity,
        adjustPantryItemQuantities,
        applyReviewedReceiptImport,
        createPantryItem,
        updatePantryItem,
        deletePantryItem,
        createKitchenTool,
        updateKitchenTool,
        deleteKitchenTool,
      }, res.locals.miseRequestId);
      const transport = new OpenAiCompatibleNodeStreamableHTTPServerTransport({
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
      } catch {
        console.error(JSON.stringify({ event: "mcp_request_failed", requestId: res.locals.miseRequestId }));
        if (!res.headersSent) res.status(500).send("Internal server error");
      }
    } else {
      const serverOptions = {
        toolSurface,
        addItems,
        loadKitchenContext: getKitchenContext,
        setPantryItemQuantity,
        adjustPantryItemQuantity,
        adjustPantryItemQuantities,
        applyReviewedReceiptImport,
        createPantryItem,
        updatePantryItem,
        deletePantryItem,
        createKitchenTool,
        updateKitchenTool,
        deleteKitchenTool,
      };
      const modernHandler = createMcpHandler(
        () => createMiseServer(serverOptions, res.locals.miseRequestId),
        { legacy: "reject", responseMode: "auto" },
      );
      const nodeHandler = toNodeHandler({
        fetch: async (request: Request, options?: { authInfo?: AuthInfo }) => {
          const response = await modernHandler.fetch(request, options);
          return patchOpenAiSecuritySchemes(response);
        },
      });
      await nodeHandler(req, res, req.body);
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
