import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdjustPantryItemQuantityBatchOutcome,
  AdjustPantryItemQuantityOutcome,
} from "@/lib/kitchen-service";
import {
  createMiseHttpServer,
  handleMiseMcpRequest,
} from "@/mcp/server";
import { kitchenWidgetResource } from "@/mcp/kitchen-widget.generated";

let httpServer: Server;
let mcpUrl: string;
const mockLoadKitchenContext = vi.fn(
  async (userId: string) => {
    void userId;
    return {
      pantry: [{
        name: "Rice",
        quantity: "2 cup",
        quantityMode: "structured" as const,
        quantityAmount: "2",
        quantityUnit: "cup" as const,
        turnover: "high" as const,
      }],
      tools: [{ name: "Dutch oven", kind: "cookware" }],
    };
  },
);
const mockSetPantryItemQuantity = vi.fn<
  typeof import("@/lib/kitchen-service").setPantryItemQuantity
>();
const mockAdjustPantryItemQuantity = vi.fn<
  typeof import("@/lib/kitchen-service").adjustPantryItemQuantity
>();
const mockAdjustPantryItemQuantities = vi.fn<
  typeof import("@/lib/kitchen-service").adjustPantryItemQuantities
>();
const mockApplyReviewedReceiptImport = vi.fn<
  typeof import("@/lib/kitchen-service").applyReviewedReceiptImport
>();
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalMcpPublicUrl = process.env.MCP_PUBLIC_URL;

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function verifyTestAccessToken(token: string): Promise<AuthInfo> {
  if (token !== "test-token") throw new Error("Invalid test token.");
  return {
    token,
    clientId: "chatgpt-test-client",
    scopes: ["openid"],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    resource: new URL("https://mcp.mise.example/mcp"),
    extra: { userId: "user-123" },
  };
}

async function postMcp(body: Record<string, unknown>, token?: string) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-11-25",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  return response;
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.MCP_PUBLIC_URL = "https://mcp.mise.example/mcp";
  mockLoadKitchenContext.mockReset();
  mockLoadKitchenContext.mockResolvedValue({
    pantry: [{
      name: "Rice",
      quantity: "2 cup",
      quantityMode: "structured",
      quantityAmount: "2",
      quantityUnit: "cup",
      turnover: "high",
    }],
    tools: [{ name: "Dutch oven", kind: "cookware" }],
  });
  mockSetPantryItemQuantity.mockReset();
  mockSetPantryItemQuantity.mockResolvedValue({
    ok: true,
    value: {
      status: "updated",
      name: "Eggs",
      beforeQuantity: "12",
      quantity: "6",
    },
  });
  mockAdjustPantryItemQuantity.mockReset();
  mockAdjustPantryItemQuantity.mockResolvedValue({
    ok: true,
    value: {
      status: "applied",
      operation: "consume",
      name: "Eggs",
      beforeQuantity: "12",
      quantity: "10",
      before: {
        mode: "structured",
        amount: "12",
        unit: "count",
        text: null,
      },
      delta: {
        mode: "structured",
        amount: "2",
        unit: "count",
        text: null,
      },
      after: {
        mode: "structured",
        amount: "10",
        unit: "count",
        text: null,
      },
    },
  });
  mockAdjustPantryItemQuantities.mockReset();
  mockAdjustPantryItemQuantities.mockResolvedValue({
    ok: true,
    value: {
      status: "applied",
      changes: [
        {
          index: 0,
          operation: "consume",
          name: "Eggs",
          beforeQuantity: "12",
          quantity: "10",
          before: {
            mode: "structured",
            amount: "12",
            unit: "count",
            text: null,
          },
          delta: {
            mode: "structured",
            amount: "2",
            unit: "count",
            text: null,
          },
          after: {
            mode: "structured",
            amount: "10",
            unit: "count",
            text: null,
          },
        },
        {
          index: 1,
          operation: "restock",
          name: "Flour",
          beforeQuantity: "2 lb",
          quantity: "3 lb",
          before: {
            mode: "structured",
            amount: "2",
            unit: "lb",
            text: null,
          },
          delta: {
            mode: "structured",
            amount: "1",
            unit: "lb",
            text: null,
          },
          after: {
            mode: "structured",
            amount: "3",
            unit: "lb",
            text: null,
          },
        },
      ],
    },
  });
  mockApplyReviewedReceiptImport.mockReset();
  mockApplyReviewedReceiptImport.mockResolvedValue({
    ok: true,
    value: {
      status: "applied",
      requestId: "b9b98fd0-c4b6-4de7-8a9d-1d05be0d6ac1",
      replayed: false,
      changes: [
        {
          index: 0,
          decision: "create",
          item: {
            name: "Black beans",
            quantity: "2 can",
            turnover: "high",
          },
        },
        {
          index: 1,
          decision: "restock",
          item: {
            name: "Rice",
            quantity: "3 cup",
            turnover: "high",
          },
          beforeQuantity: "2 cup",
          afterQuantity: "3 cup",
          before: {
            mode: "structured",
            amount: "2",
            unit: "cup",
            text: null,
          },
          delta: {
            mode: "structured",
            amount: "1",
            unit: "cup",
            text: null,
          },
          after: {
            mode: "structured",
            amount: "3",
            unit: "cup",
            text: null,
          },
        },
      ],
    },
  });

  httpServer = createMiseHttpServer({
    verifyAccessToken: verifyTestAccessToken,
    loadKitchenContext: mockLoadKitchenContext,
    setPantryItemQuantity: mockSetPantryItemQuantity,
    adjustPantryItemQuantity: mockAdjustPantryItemQuantity,
    adjustPantryItemQuantities: mockAdjustPantryItemQuantities,
    applyReviewedReceiptImport: mockApplyReviewedReceiptImport,
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address() as AddressInfo;
  mcpUrl = `http://127.0.0.1:${address.port}/mcp`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
  restoreEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL", originalSupabaseUrl);
  restoreEnvironmentVariable("MCP_PUBLIC_URL", originalMcpPublicUrl);
});

describe("Mise MCP OAuth wire contract", () => {
  it("publishes SDK-generated protected-resource metadata", async () => {
    const response = await fetch(
      new URL("/.well-known/oauth-protected-resource/mcp", mcpUrl),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: "https://mcp.mise.example/mcp",
      authorization_servers: ["https://project.supabase.co/auth/v1"],
      scopes_supported: ["openid"],
      resource_name: "Mise",
    });
  });

  it("republishes the Supabase authorization endpoints", async () => {
    const response = await fetch(
      new URL("/.well-known/oauth-authorization-server", mcpUrl),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      issuer: "https://project.supabase.co/auth/v1",
      authorization_endpoint:
        "https://project.supabase.co/auth/v1/oauth/authorize",
      token_endpoint: "https://project.supabase.co/auth/v1/oauth/token",
      registration_endpoint:
        "https://project.supabase.co/auth/v1/oauth/clients/register",
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("initializes an authenticated stateless MCP request", async () => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "mise-contract-test", version: "1.0.0" },
      },
    }, "test-token");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        protocolVersion: "2025-11-25",
        serverInfo: { name: "mise", version: "0.1.0" },
        capabilities: {
          tools: {},
          resources: {},
        },
        instructions: expect.stringContaining(
          "Read get_kitchen_context before relative or receipt writes",
        ),
      },
    });
    const body = await (await postMcp({
      jsonrpc: "2.0",
      id: 14,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "mise-contract-test", version: "1.0.0" },
      },
    }, "test-token")).json() as {
      result: { instructions: string };
    };
    expect(body.result.instructions.slice(0, 512)).toContain(
      "receipt images and proposals alone never authorize writes",
    );
    expect(body.result.instructions.slice(0, 512)).toContain(
      "On rejection/conflict, reread",
    );
    expect(body.result.instructions.length).toBeLessThanOrEqual(512);
  });

  it("publishes OAuth security schemes at the top level and in the compatibility mirror", async () => {
    const httpResponse = await postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }, "test-token");
    expect(httpResponse.status).toBe(200);
    const response = (await httpResponse.json()) as Record<string, unknown>;

    const result = response.result as { tools: Array<Record<string, unknown>> };
    const tool = result.tools.find(({ name }) => name === "get_kitchen_context");
    const expectedSchemes = [{ type: "oauth2", scopes: ["openid"] }];

    expect(tool).toBeDefined();
    expect(tool?.description).toContain("Use this when");
    expect(tool?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(tool?.outputSchema).toMatchObject({
      type: "object",
      properties: {
        pantry: { type: "array" },
        tools: { type: "array" },
      },
      required: ["pantry", "tools"],
    });
    expect(tool?.securitySchemes).toEqual(expectedSchemes);
    expect(tool?._meta).toMatchObject({
      securitySchemes: expectedSchemes,
      ui: { resourceUri: kitchenWidgetResource.uri },
      "openai/outputTemplate": kitchenWidgetResource.uri,
    });
  });

  it("calls the shared kitchen service with the authenticated user ID", async () => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "get_kitchen_context",
        arguments: {},
      },
    }, "test-token");

    expect(response.status).toBe(200);
    const body = await response.json() as {
      result: {
        structuredContent: {
          pantry: Array<Record<string, unknown>>;
          tools: Array<Record<string, unknown>>;
        };
      };
    };
    expect(body).toMatchObject({
      result: {
        content: [
          { type: "text", text: "Returned your Mise kitchen context." },
        ],
        structuredContent: {
          pantry: [
            {
              name: "Rice",
              quantity: "2 cup",
              quantityMode: "structured",
              quantityAmount: "2",
              quantityUnit: "cup",
              turnover: "high",
            },
          ],
          tools: [{ name: "Dutch oven", kind: "cookware" }],
        },
      },
    });
    expect(mockLoadKitchenContext).toHaveBeenCalledWith("user-123");
    expect(Object.keys(body.result.structuredContent.pantry[0])).toEqual([
      "name",
      "quantity",
      "quantityMode",
      "quantityAmount",
      "quantityUnit",
      "turnover",
    ]);
    expect(Object.keys(body.result.structuredContent.tools[0])).toEqual([
      "name",
      "kind",
    ]);
  });

  it("publishes and executes the retry-safe pantry quantity tool", async () => {
    const listResponse = await postMcp({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/list",
    }, "test-token");
    const listBody = await listResponse.json() as {
      result: { tools: Array<Record<string, unknown>> };
    };
    const tool = listBody.result.tools.find(
      ({ name }) => name === "set_pantry_item_quantity",
    );
    const expectedSchemes = [{ type: "oauth2", scopes: ["openid"] }];

    expect(tool).toMatchObject({
      description: expect.stringContaining("Use this when"),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity"],
      },
      outputSchema: {
        type: "object",
        required: ["status", "name"],
        properties: {
          status: {
            type: "string",
            enum: ["updated", "unchanged", "not_found"],
          },
        },
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: expectedSchemes,
      _meta: { securitySchemes: expectedSchemes },
    });
    expect((tool?._meta as Record<string, unknown>).ui).toBeUndefined();

    const callResponse = await postMcp({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "set_pantry_item_quantity",
        arguments: { name: " Eggs ", quantity: " 6 " },
      },
    }, "test-token");
    const callBody = await callResponse.json() as {
      result: {
        content: Array<{ type: string; text: string }>;
        structuredContent: Record<string, unknown>;
      };
    };

    expect(callResponse.status).toBe(200);
    expect(callBody).toEqual({
      result: {
        content: [{ type: "text", text: "Set Eggs from 12 to 6." }],
        structuredContent: {
          status: "updated",
          name: "Eggs",
          beforeQuantity: "12",
          quantity: "6",
        },
      },
      jsonrpc: "2.0",
      id: 10,
    });
    expect(mockSetPantryItemQuantity).toHaveBeenCalledWith("user-123", {
      name: "Eggs",
      quantity: "6",
    });
    expect(Object.keys(callBody.result.structuredContent)).toEqual([
      "status",
      "name",
      "beforeQuantity",
      "quantity",
    ]);
  });

  it("never accepts caller-supplied identity for a pantry write", async () => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "set_pantry_item_quantity",
        arguments: {
          name: "Eggs",
          quantity: "6",
          userId: "attacker-selected-user",
        },
      },
    }, "test-token");
    const body = await response.json() as {
      result: {
        isError?: boolean;
        structuredContent?: Record<string, unknown>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.result.isError).toBe(true);
    expect(mockSetPantryItemQuantity).not.toHaveBeenCalled();
    expect(body.result.structuredContent).toBeUndefined();
  });

  it("publishes exact OAuth-protected consume and restock descriptors without widget linkage", async () => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 15,
      method: "tools/list",
    }, "test-token");
    const body = await response.json() as {
      result: { tools: Array<Record<string, unknown>> };
    };
    const expectedSchemes = [{ type: "oauth2", scopes: ["openid"] }];

    for (const [
      name,
      destructiveHint,
    ] of [
      ["consume_pantry_item", true],
      ["restock_pantry_item", false],
    ] as const) {
      const tool = body.result.tools.find((candidate) =>
        candidate.name === name
      );

      expect(tool).toMatchObject({
        description: expect.stringContaining("current turn"),
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["name", "expectedQuantity", "deltaQuantity"],
          properties: {
            name: { type: "string" },
            expectedQuantity: {
              type: "object",
              required: ["amount", "unit"],
              additionalProperties: false,
            },
            deltaQuantity: {
              type: "object",
              required: ["amount", "unit"],
              additionalProperties: false,
            },
          },
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint,
          idempotentHint: false,
          openWorldHint: false,
        },
        securitySchemes: expectedSchemes,
        _meta: { securitySchemes: expectedSchemes },
      });
      const serializedOutputSchema = JSON.stringify(tool?.outputSchema);
      expect(tool?.outputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
        required: ["outcome"],
        properties: { outcome: {} },
      });
      for (const status of [
        "applied",
        "not_found",
        "unsupported_quantity",
        "conflict",
        "unit_mismatch",
        "insufficient_quantity",
        "amount_exceeded",
      ]) {
        expect(serializedOutputSchema).toContain(`"${status}"`);
      }
      expect((tool?._meta as Record<string, unknown>).ui).toBeUndefined();
      expect(
        (tool?._meta as Record<string, unknown>)["openai/outputTemplate"],
      ).toBeUndefined();
    }
  });

  it("calls consume and restock through the shared service using authenticated identity", async () => {
    const consumeResponse = await postMcp({
      jsonrpc: "2.0",
      id: 16,
      method: "tools/call",
      params: {
        name: "consume_pantry_item",
        arguments: {
          name: " Eggs ",
          expectedQuantity: { amount: " 12 ", unit: "count" },
          deltaQuantity: { amount: " 2 ", unit: "count" },
        },
      },
    }, "test-token");
    const consumeBody = await consumeResponse.json();

    expect(consumeBody).toMatchObject({
      result: {
        content: [{
          type: "text",
          text: "Consumed 2 count from Eggs. Quantity is now 10.",
        }],
        structuredContent: {
          outcome: {
            status: "applied",
            operation: "consume",
            name: "Eggs",
            beforeQuantity: "12",
            quantity: "10",
          },
        },
      },
    });
    expect(mockAdjustPantryItemQuantity).toHaveBeenLastCalledWith(
      "user-123",
      {
        name: "Eggs",
        operation: "consume",
        expectedQuantity: "12 count",
        deltaQuantity: "2 count",
      },
    );

    mockAdjustPantryItemQuantity.mockResolvedValueOnce({
      ok: true,
      value: {
        status: "applied",
        operation: "restock",
        name: "Rice",
        beforeQuantity: "2 bag",
        quantity: "3 bag",
        before: {
          mode: "structured",
          amount: "2",
          unit: "bag",
          text: null,
        },
        delta: {
          mode: "structured",
          amount: "1",
          unit: "bag",
          text: null,
        },
        after: {
          mode: "structured",
          amount: "3",
          unit: "bag",
          text: null,
        },
      },
    });
    const restockResponse = await postMcp({
      jsonrpc: "2.0",
      id: 17,
      method: "tools/call",
      params: {
        name: "restock_pantry_item",
        arguments: {
          name: "Rice",
          expectedQuantity: { amount: "2", unit: "bag" },
          deltaQuantity: { amount: "1", unit: "bag" },
        },
      },
    }, "test-token");
    await expect(restockResponse.json()).resolves.toMatchObject({
      result: {
        content: [{
          type: "text",
          text: "Restocked Rice by 1 bag. Quantity is now 3 bag.",
        }],
        structuredContent: {
          outcome: {
            status: "applied",
            operation: "restock",
          },
        },
      },
    });
    expect(mockAdjustPantryItemQuantity).toHaveBeenLastCalledWith(
      "user-123",
      {
        name: "Rice",
        operation: "restock",
        expectedQuantity: "2 bag",
        deltaQuantity: "1 bag",
      },
    );
  });

  it("publishes and executes one atomic reviewed pantry batch tool", async () => {
    const listResponse = await postMcp({
      jsonrpc: "2.0",
      id: 18,
      method: "tools/list",
    }, "test-token");
    const listBody = await listResponse.json() as {
      result: { tools: Array<Record<string, unknown>> };
    };
    const tool = listBody.result.tools.find(
      ({ name }) => name === "apply_pantry_adjustments",
    );
    const expectedSchemes = [{ type: "oauth2", scopes: ["openid"] }];

    expect(tool).toMatchObject({
      description: expect.stringContaining("applies atomically"),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["changes"],
        properties: {
          changes: {
            type: "array",
            minItems: 1,
            maxItems: 25,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "name",
                "operation",
                "expectedQuantity",
                "deltaQuantity",
              ],
            },
          },
        },
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      securitySchemes: expectedSchemes,
      _meta: { securitySchemes: expectedSchemes },
    });
    expect(tool?.outputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["outcome"],
      properties: {
        outcome: {
          oneOf: [
            expect.objectContaining({
              properties: expect.objectContaining({
                status: expect.objectContaining({ const: "applied" }),
                changes: expect.objectContaining({
                  type: "array",
                  minItems: 1,
                  maxItems: 25,
                }),
              }),
            }),
            expect.objectContaining({
              properties: expect.objectContaining({
                status: expect.objectContaining({ const: "rejected" }),
                failures: expect.objectContaining({
                  type: "array",
                  minItems: 1,
                  maxItems: 25,
                }),
              }),
            }),
          ],
        },
      },
    });
    const serializedOutputSchema = JSON.stringify(tool?.outputSchema);
    for (const status of [
      "applied",
      "rejected",
      "duplicate_target",
      "not_found",
      "unsupported_quantity",
      "conflict",
      "unit_mismatch",
      "insufficient_quantity",
      "amount_exceeded",
    ]) {
      expect(serializedOutputSchema).toContain(`"${status}"`);
    }
    expect((tool?._meta as Record<string, unknown>).ui).toBeUndefined();
    expect(
      (tool?._meta as Record<string, unknown>)["openai/outputTemplate"],
    ).toBeUndefined();

    const callResponse = await postMcp({
      jsonrpc: "2.0",
      id: 19,
      method: "tools/call",
      params: {
        name: "apply_pantry_adjustments",
        arguments: {
          changes: [
            {
              name: " Eggs ",
              operation: "consume",
              expectedQuantity: { amount: " 12 ", unit: "count" },
              deltaQuantity: { amount: " 2 ", unit: "count" },
            },
            {
              name: "Flour",
              operation: "restock",
              expectedQuantity: { amount: "2", unit: "lb" },
              deltaQuantity: { amount: "1", unit: "lb" },
            },
          ],
        },
      },
    }, "test-token");
    await expect(callResponse.json()).resolves.toMatchObject({
      result: {
        content: [{
          type: "text",
          text: "Applied 2 pantry changes atomically.",
        }],
        structuredContent: {
          outcome: {
            status: "applied",
            changes: [
              { index: 0, operation: "consume", name: "Eggs" },
              { index: 1, operation: "restock", name: "Flour" },
            ],
          },
        },
      },
    });
    expect(mockAdjustPantryItemQuantities).toHaveBeenCalledTimes(1);
    expect(mockAdjustPantryItemQuantities).toHaveBeenCalledWith(
      "user-123",
      {
        changes: [
          {
            name: "Eggs",
            operation: "consume",
            expectedQuantity: "12 count",
            deltaQuantity: "2 count",
          },
          {
            name: "Flour",
            operation: "restock",
            expectedQuantity: "2 lb",
            deltaQuantity: "1 lb",
          },
        ],
      },
    );
  });

  it("publishes and executes one idempotent reviewed receipt import tool", async () => {
    const listResponse = await postMcp({
      jsonrpc: "2.0",
      id: 66,
      method: "tools/list",
    }, "test-token");
    const listBody = await listResponse.json() as {
      result: { tools: Array<Record<string, unknown>> };
    };
    const tool = listBody.result.tools.find(
      ({ name }) => name === "apply_reviewed_receipt_import",
    );
    const expectedSchemes = [{ type: "oauth2", scopes: ["openid"] }];

    expect(tool).toMatchObject({
      description: expect.stringContaining(
        "only after the user explicitly confirms",
      ),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["requestId", "lines"],
        properties: {
          requestId: { type: "string", format: "uuid" },
          lines: {
            type: "array",
            minItems: 1,
            maxItems: 25,
            items: {
              oneOf: [
                expect.objectContaining({
                  additionalProperties: false,
                  required: ["decision", "name", "quantity"],
                }),
                expect.objectContaining({
                  additionalProperties: false,
                  required: [
                    "decision",
                    "name",
                    "expectedQuantity",
                    "deltaQuantity",
                  ],
                }),
              ],
            },
          },
        },
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      securitySchemes: expectedSchemes,
      _meta: { securitySchemes: expectedSchemes },
    });
    expect((tool?._meta as Record<string, unknown>).ui).toBeUndefined();
    expect(
      (tool?._meta as Record<string, unknown>)["openai/outputTemplate"],
    ).toBeUndefined();

    const serializedOutputSchema = JSON.stringify(tool?.outputSchema);
    for (const status of [
      "applied",
      "rejected",
      "request_id_reused",
      "duplicate_target",
      "already_exists",
      "not_found",
      "unsupported_quantity",
      "conflict",
      "unit_mismatch",
      "insufficient_quantity",
      "amount_exceeded",
    ]) {
      expect(serializedOutputSchema).toContain(`"${status}"`);
    }

    const requestId = "b9b98fd0-c4b6-4de7-8a9d-1d05be0d6ac1";
    const callResponse = await postMcp({
      jsonrpc: "2.0",
      id: 67,
      method: "tools/call",
      params: {
        name: "apply_reviewed_receipt_import",
        arguments: {
          requestId,
          lines: [
            {
              decision: "create",
              name: " Black beans ",
              quantity: { amount: " 2 ", unit: "can" },
            },
            {
              decision: "restock",
              name: " Rice ",
              expectedQuantity: { amount: " 2 ", unit: "cup" },
              deltaQuantity: { amount: " 1 ", unit: "cup" },
            },
          ],
        },
      },
    }, "test-token");

    await expect(callResponse.json()).resolves.toMatchObject({
      result: {
        content: [{
          type: "text",
          text: "Applied 2 reviewed receipt items atomically.",
        }],
        structuredContent: {
          outcome: {
            status: "applied",
            requestId,
            replayed: false,
            changes: [
              { index: 0, decision: "create" },
              { index: 1, decision: "restock" },
            ],
          },
        },
      },
    });
    expect(mockApplyReviewedReceiptImport).toHaveBeenCalledTimes(1);
    expect(mockApplyReviewedReceiptImport).toHaveBeenCalledWith(
      "user-123",
      {
        requestId,
        lines: [
          {
            decision: "create",
            name: "Black beans",
            quantity: "2 can",
          },
          {
            decision: "restock",
            name: "Rice",
            expectedQuantity: "2 cup",
            deltaQuantity: "1 cup",
          },
        ],
      },
    );
  });

  it.each([
    ["invalid UUID", {
      requestId: "not-a-uuid",
      lines: [{
        decision: "create",
        name: "Beans",
        quantity: { amount: "2", unit: "can" },
      }],
    }],
    ["empty lines", {
      requestId: "b9b98fd0-c4b6-4de7-8a9d-1d05be0d6ac1",
      lines: [],
    }],
    ["too many lines", {
      requestId: "b9b98fd0-c4b6-4de7-8a9d-1d05be0d6ac1",
      lines: Array.from({ length: 26 }, () => ({
        decision: "create",
        name: "Beans",
        quantity: { amount: "2", unit: "can" },
      })),
    }],
    ["zero quantity", {
      requestId: "b9b98fd0-c4b6-4de7-8a9d-1d05be0d6ac1",
      lines: [{
        decision: "create",
        name: "Beans",
        quantity: { amount: "0", unit: "can" },
      }],
    }],
    ["wrong union fields", {
      requestId: "b9b98fd0-c4b6-4de7-8a9d-1d05be0d6ac1",
      lines: [{
        decision: "restock",
        name: "Beans",
        quantity: { amount: "2", unit: "can" },
      }],
    }],
    ["extra property", {
      requestId: "b9b98fd0-c4b6-4de7-8a9d-1d05be0d6ac1",
      lines: [{
        decision: "create",
        name: "Beans",
        quantity: { amount: "2", unit: "can" },
        guessed: true,
      }],
    }],
  ])("rejects malformed reviewed receipt arguments: %s", async (
    _caseName,
    argumentsValue,
  ) => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 71,
      method: "tools/call",
      params: {
        name: "apply_reviewed_receipt_import",
        arguments: argumentsValue,
      },
    }, "test-token");
    const body = await response.json() as {
      result?: {
        isError?: boolean;
        content?: Array<{ text?: string }>;
      };
    };

    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0].text).toContain(
      "MCP error -32602: Input validation error",
    );
    expect(mockApplyReviewedReceiptImport).not.toHaveBeenCalled();
  });

  it("truthfully narrates receipt replay, rejection, and request ID reuse", async () => {
    const requestId = "b9b98fd0-c4b6-4de7-8a9d-1d05be0d6ac1";
    mockApplyReviewedReceiptImport
      .mockResolvedValueOnce({
        ok: true,
        value: {
          status: "applied",
          requestId,
          replayed: true,
          changes: [{
            index: 0,
            decision: "create",
            item: {
              name: "Black beans",
              quantity: "2 can",
              turnover: "high",
            },
          }],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          status: "rejected",
          requestId,
          replayed: false,
          failures: [{
            index: 0,
            name: "Rice",
            status: "conflict",
            expected: {
              mode: "structured",
              amount: "2",
              unit: "cup",
              text: null,
            },
            current: {
              mode: "structured",
              amount: "3",
              unit: "cup",
              text: null,
            },
          }],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { status: "request_id_reused", requestId },
      });

    const argumentsValue = {
      requestId,
      lines: [{
        decision: "create",
        name: "Black beans",
        quantity: { amount: "2", unit: "can" },
      }],
    };
    const texts: string[] = [];
    for (const id of [68, 69, 70]) {
      const response = await postMcp({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: {
          name: "apply_reviewed_receipt_import",
          arguments: argumentsValue,
        },
      }, "test-token");
      const body = await response.json() as {
        result: { content: Array<{ text: string }> };
      };
      texts.push(body.result.content[0].text);
    }

    expect(texts[0]).toContain("already applied");
    expect(texts[0]).toContain("without changing the pantry again");
    expect(texts[1]).toContain("No pantry changes were applied");
    expect(texts[1]).toContain("Rice: conflict");
    expect(texts[2]).toContain("already used for a different");
    expect(texts[2]).toContain("Nothing changed");
  });

  it("truthfully narrates every rejected pantry batch as all-or-nothing", async () => {
    const structured = (
      amount: string,
      unit: "count" | "bag" | "lb",
    ) => ({
      mode: "structured" as const,
      amount,
      unit,
      text: null,
    });
    const failures: Array<
      Extract<
        AdjustPantryItemQuantityBatchOutcome,
        { status: "rejected" }
      >["failures"][number]
    > = [
      {
        index: 0,
        name: "Eggs",
        status: "duplicate_target",
        duplicateIndexes: [0, 1],
      },
      { index: 0, name: "Milk", status: "not_found" },
      {
        index: 0,
        name: "Milk",
        status: "unsupported_quantity",
        currentQuantity: "about half",
      },
      {
        index: 0,
        name: "Eggs",
        status: "conflict",
        expected: structured("12", "count"),
        current: structured("10", "count"),
      },
      {
        index: 0,
        name: "Flour",
        status: "unit_mismatch",
        expectedUnit: "lb",
        deltaUnit: "count",
      },
      {
        index: 0,
        name: "Rice",
        status: "insufficient_quantity",
        current: structured("1", "bag"),
        delta: structured("2", "bag"),
      },
      {
        index: 0,
        name: "Flour",
        status: "amount_exceeded",
        current: structured("999999999.999999", "lb"),
        delta: structured("0.000001", "lb"),
      },
    ];

    for (const [index, failure] of failures.entries()) {
      const outcome = {
        status: "rejected" as const,
        failures: [failure],
      };
      mockAdjustPantryItemQuantities.mockResolvedValueOnce({
        ok: true,
        value: outcome,
      });
      const response = await postMcp({
        jsonrpc: "2.0",
        id: 40 + index,
        method: "tools/call",
        params: {
          name: "apply_pantry_adjustments",
          arguments: {
            changes: [{
              name: "Eggs",
              operation: "consume",
              expectedQuantity: { amount: "12", unit: "count" },
              deltaQuantity: { amount: "2", unit: "count" },
            }],
          },
        },
      }, "test-token");
      const body = await response.json() as {
        result: {
          content: Array<{ text: string }>;
          structuredContent: { outcome: unknown };
        };
      };
      expect(body.result.content[0].text).toMatch(
        /^No pantry changes were applied\./,
      );
      expect(body.result.structuredContent.outcome).toEqual(outcome);
    }
  });

  it("rejects malformed, identity-injected, and unauthenticated pantry batches", async () => {
    const invalidArguments = [
      { changes: "not-an-array" },
      { changes: [] },
      {
        changes: [{
          name: "Eggs",
          operation: "consume",
          expectedQuantity: { amount: "12", unit: "count" },
        }],
      },
      {
        changes: [{
          name: "Eggs",
          operation: "set",
          expectedQuantity: { amount: "12", unit: "count" },
          deltaQuantity: { amount: "2", unit: "count" },
        }],
      },
      {
        changes: [{
          name: "Eggs",
          operation: "consume",
          expectedQuantity: { amount: "12", unit: "serving" },
          deltaQuantity: { amount: "2", unit: "serving" },
        }],
      },
      {
        changes: [{
          name: "Eggs",
          operation: "consume",
          expectedQuantity: { amount: "01", unit: "count" },
          deltaQuantity: { amount: "2", unit: "count" },
        }],
      },
      {
        changes: [{
          name: "Eggs",
          operation: "consume",
          expectedQuantity: { amount: "12", unit: "count" },
          deltaQuantity: { amount: "0", unit: "count" },
        }],
      },
      {
        changes: [{
          name: "Eggs",
          operation: "consume",
          expectedQuantity: { amount: "12", unit: "count" },
          deltaQuantity: { amount: "2", unit: "count" },
        }],
        userId: "attacker-selected-user",
      },
      {
        changes: Array.from({ length: 26 }, () => ({
          name: "Eggs",
          operation: "consume",
          expectedQuantity: { amount: "12", unit: "count" },
          deltaQuantity: { amount: "2", unit: "count" },
        })),
      },
    ];

    for (const [index, argumentsValue] of invalidArguments.entries()) {
      const response = await postMcp({
        jsonrpc: "2.0",
        id: 60 + index,
        method: "tools/call",
        params: {
          name: "apply_pantry_adjustments",
          arguments: argumentsValue,
        },
      }, "test-token");
      await expect(response.json()).resolves.toMatchObject({
        result: { isError: true },
      });
    }
    expect(mockAdjustPantryItemQuantities).not.toHaveBeenCalled();

    const unauthenticated = await postMcp({
      jsonrpc: "2.0",
      id: 80,
      method: "tools/call",
      params: {
        name: "apply_pantry_adjustments",
        arguments: {
          changes: [{
            name: "Eggs",
            operation: "consume",
            expectedQuantity: { amount: "12", unit: "count" },
            deltaQuantity: { amount: "2", unit: "count" },
          }],
        },
      },
    });
    expect(unauthenticated.status).toBe(401);
    expect(mockAdjustPantryItemQuantities).not.toHaveBeenCalled();
  });

  it("narrates every non-applied adjustment outcome without claiming a mutation", async () => {
    const structured = (
      amount: string,
      unit: "count" | "bag" | "lb",
    ) => ({
      mode: "structured" as const,
      amount,
      unit,
      text: null,
    });
    const cases: Array<{
      outcome: AdjustPantryItemQuantityOutcome;
      expectedText: string;
    }> = [
      {
        outcome: { status: "not_found", name: "Eggs" },
        expectedText: "No pantry item matched Eggs. Nothing changed.",
      },
      {
        outcome: {
          status: "unsupported_quantity",
          name: "Milk",
          currentQuantity: "about half",
        },
        expectedText:
          "Milk has an unsupported quantity (about half). Set an exact structured quantity first.",
      },
      {
        outcome: {
          status: "conflict",
          name: "Eggs",
          expected: structured("12", "count"),
          current: structured("10", "count"),
        },
        expectedText:
          "Eggs is now 10 count. Refresh kitchen context before retrying. Nothing changed.",
      },
      {
        outcome: {
          status: "unit_mismatch",
          name: "Flour",
          expectedUnit: "lb",
          deltaUnit: "count",
        },
        expectedText:
          "Expected lb, but the change uses count. Nothing changed.",
      },
      {
        outcome: {
          status: "insufficient_quantity",
          name: "Rice",
          current: structured("1", "bag"),
          delta: structured("2", "bag"),
        },
        expectedText:
          "Rice has 1 bag, less than the requested 2 bag. Nothing changed.",
      },
      {
        outcome: {
          status: "amount_exceeded",
          name: "Flour",
          current: structured("999999999.999999", "lb"),
          delta: structured("0.000001", "lb"),
        },
        expectedText:
          "Restocking Flour by 0.000001 lb would exceed the quantity limit. Nothing changed.",
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      mockAdjustPantryItemQuantity.mockResolvedValueOnce({
        ok: true,
        value: testCase.outcome,
      });
      const response = await postMcp({
        jsonrpc: "2.0",
        id: 20 + index,
        method: "tools/call",
        params: {
          name: "consume_pantry_item",
          arguments: {
            name: testCase.outcome.name,
            expectedQuantity: { amount: "1", unit: "count" },
            deltaQuantity: { amount: "1", unit: "count" },
          },
        },
      }, "test-token");
      await expect(response.json()).resolves.toMatchObject({
        result: {
          content: [{ type: "text", text: testCase.expectedText }],
          structuredContent: { outcome: testCase.outcome },
        },
      });
    }
  });

  it("rejects identity injection and unauthenticated adjustment calls", async () => {
    const invalidInput = await postMcp({
      jsonrpc: "2.0",
      id: 30,
      method: "tools/call",
      params: {
        name: "consume_pantry_item",
        arguments: {
          name: "Eggs",
          expectedQuantity: { amount: "12", unit: "count" },
          deltaQuantity: { amount: "2", unit: "count" },
          userId: "attacker-selected-user",
        },
      },
    }, "test-token");
    const invalidBody = await invalidInput.json() as {
      result: { isError?: boolean };
    };
    expect(invalidBody.result.isError).toBe(true);
    expect(mockAdjustPantryItemQuantity).not.toHaveBeenCalled();

    const zeroDelta = await postMcp({
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: {
        name: "consume_pantry_item",
        arguments: {
          name: "Eggs",
          expectedQuantity: { amount: "12", unit: "count" },
          deltaQuantity: { amount: "0", unit: "count" },
        },
      },
    }, "test-token");
    const zeroDeltaBody = await zeroDelta.json() as {
      result: { isError?: boolean };
    };
    expect(zeroDeltaBody.result.isError).toBe(true);
    expect(mockAdjustPantryItemQuantity).not.toHaveBeenCalled();

    const unauthenticated = await postMcp({
      jsonrpc: "2.0",
      id: 31,
      method: "tools/call",
      params: {
        name: "restock_pantry_item",
        arguments: {
          name: "Rice",
          expectedQuantity: { amount: "2", unit: "bag" },
          deltaQuantity: { amount: "1", unit: "bag" },
        },
      },
    });
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://mcp.mise.example/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("delivers the widget resource with an explicit no-network CSP", async () => {
    // This is a regression budget, not a documented host limit. It prevents
    // the bundler from silently selecting CommonJS SDK entry points again.
    expect(Buffer.byteLength(kitchenWidgetResource.html)).toBeLessThan(800_000);

    const response = await postMcp({
      jsonrpc: "2.0",
      id: 8,
      method: "resources/read",
      params: { uri: kitchenWidgetResource.uri },
    }, "test-token");
    const body = await response.json() as {
      result: {
        contents: Array<{
          uri: string;
          mimeType: string;
          text: string;
          _meta: {
            ui: {
              csp: {
                connectDomains: string[];
                resourceDomains: string[];
              };
            };
          };
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.result.contents[0]).toMatchObject({
      uri: kitchenWidgetResource.uri,
      mimeType: "text/html;profile=mcp-app",
      _meta: {
        ui: {
          csp: {
            connectDomains: [],
            resourceDomains: [],
          },
        },
      },
    });
    expect(body.result.contents[0].text).toContain('<div id="root"></div>');
    expect(body.result.contents[0].text).toContain(
      "No pantry items saved yet.",
    );
    expect(body.result.contents[0].text).toContain(
      "No kitchen tools saved yet.",
    );
  });

  it("serves the same authenticated tool contract through the Web-standard hosted transport", async () => {
    const request = new Request("https://mcp.mise.example/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: "Bearer test-token",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/list",
      }),
    });
    const response = await handleMiseMcpRequest(request, {
      verifyAccessToken: verifyTestAccessToken,
      loadKitchenContext: mockLoadKitchenContext,
      setPantryItemQuantity: mockSetPantryItemQuantity,
      adjustPantryItemQuantity: mockAdjustPantryItemQuantity,
      adjustPantryItemQuantities: mockAdjustPantryItemQuantities,
      applyReviewedReceiptImport: mockApplyReviewedReceiptImport,
    });
    const body = (await response.json()) as {
      result: { tools: Array<Record<string, unknown>> };
    };
    expect(response.status).toBe(200);
    for (const name of [
      "get_kitchen_context",
      "set_pantry_item_quantity",
      "consume_pantry_item",
      "restock_pantry_item",
      "apply_pantry_adjustments",
      "apply_reviewed_receipt_import",
    ]) {
      const tool = body.result.tools.find(
        (candidate) => candidate.name === name,
      );
      const expectedSchemes = [{ type: "oauth2", scopes: ["openid"] }];
      expect(tool?.securitySchemes).toEqual(expectedSchemes);
      expect(
        (tool?._meta as Record<string, unknown>).securitySchemes,
      ).toEqual(expectedSchemes);
    }
  });

  it("executes the pantry batch once through the hosted transport with authenticated identity", async () => {
    const request = new Request("https://mcp.mise.example/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: "Bearer test-token",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 65,
        method: "tools/call",
        params: {
          name: "apply_pantry_adjustments",
          arguments: {
            changes: [
              {
                name: "Eggs",
                operation: "consume",
                expectedQuantity: { amount: "12", unit: "count" },
                deltaQuantity: { amount: "2", unit: "count" },
              },
              {
                name: "Flour",
                operation: "restock",
                expectedQuantity: { amount: "2", unit: "lb" },
                deltaQuantity: { amount: "1", unit: "lb" },
              },
            ],
          },
        },
      }),
    });
    const response = await handleMiseMcpRequest(request, {
      verifyAccessToken: verifyTestAccessToken,
      loadKitchenContext: mockLoadKitchenContext,
      setPantryItemQuantity: mockSetPantryItemQuantity,
      adjustPantryItemQuantity: mockAdjustPantryItemQuantity,
      adjustPantryItemQuantities: mockAdjustPantryItemQuantities,
      applyReviewedReceiptImport: mockApplyReviewedReceiptImport,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        content: [{
          type: "text",
          text: "Applied 2 pantry changes atomically.",
        }],
        structuredContent: {
          outcome: { status: "applied" },
        },
      },
    });
    expect(mockAdjustPantryItemQuantities).toHaveBeenCalledTimes(1);
    expect(mockAdjustPantryItemQuantities).toHaveBeenCalledWith(
      "user-123",
      expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({ name: "Eggs" }),
          expect.objectContaining({ name: "Flour" }),
        ]),
      }),
    );
  });

  it("keeps OAuth discovery fail-closed on the hosted transport", async () => {
    const response = await handleMiseMcpRequest(
      new Request("https://mcp.mise.example/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
          method: "initialize",
        }),
      }),
      { verifyAccessToken: verifyTestAccessToken },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://mcp.mise.example/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("rejects invalid tokens through the hosted transport", async () => {
    const response = await handleMiseMcpRequest(
      new Request("https://mcp.mise.example/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer expired-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 6,
          method: "initialize",
        }),
      }),
      { verifyAccessToken: verifyTestAccessToken },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'error="invalid_token"',
    );
  });

  it("starts OAuth discovery before exposing MCP to an unauthenticated client", async () => {
    const response = await postMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
    });
    const challenge = response.headers.get("www-authenticate") ?? "";

    expect(response.status).toBe(401);
    expect(challenge).toContain(
      'resource_metadata="https://mcp.mise.example/.well-known/oauth-protected-resource/mcp"',
    );
    expect(challenge).toContain('scope="openid"');
    expect(challenge).not.toContain("error=");
  });

  it("rejects an invalid bearer token with a reauthorization challenge", async () => {
    const response = await postMcp(
      { jsonrpc: "2.0", id: 3, method: "initialize" },
      "expired-token",
    );
    const challenge = response.headers.get("www-authenticate") ?? "";

    expect(response.status).toBe(401);
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain(
      'error_description="The Mise access token is invalid or expired."',
    );
    });
  });

  it("executes a reviewed receipt import once through the hosted transport", async () => {
    const requestId = "b9b98fd0-c4b6-4de7-8a9d-1d05be0d6ac1";
    const request = new Request("https://mcp.mise.example/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: "Bearer test-token",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 72,
        method: "tools/call",
        params: {
          name: "apply_reviewed_receipt_import",
          arguments: {
            requestId,
            lines: [{
              decision: "restock",
              name: "Rice",
              expectedQuantity: { amount: "2", unit: "cup" },
              deltaQuantity: { amount: "1", unit: "cup" },
            }],
          },
        },
      }),
    });
    const response = await handleMiseMcpRequest(request, {
      verifyAccessToken: verifyTestAccessToken,
      loadKitchenContext: mockLoadKitchenContext,
      setPantryItemQuantity: mockSetPantryItemQuantity,
      adjustPantryItemQuantity: mockAdjustPantryItemQuantity,
      adjustPantryItemQuantities: mockAdjustPantryItemQuantities,
      applyReviewedReceiptImport: mockApplyReviewedReceiptImport,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        structuredContent: {
          outcome: {
            status: "applied",
            requestId,
            replayed: false,
          },
        },
      },
    });
    expect(mockApplyReviewedReceiptImport).toHaveBeenCalledTimes(1);
    expect(mockApplyReviewedReceiptImport).toHaveBeenCalledWith(
      "user-123",
      {
        requestId,
        lines: [{
          decision: "restock",
          name: "Rice",
          expectedQuantity: "2 cup",
          deltaQuantity: "1 cup",
        }],
      },
    );
  });
