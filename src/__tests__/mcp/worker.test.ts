import { describe, expect, it, beforeEach, vi } from "vitest";
import { app } from "@/mcp/worker";

const telemetryMocks = vi.hoisted(() => ({ start: vi.fn(), flush: vi.fn(async () => {}) }));
vi.mock("@/lib/telemetry", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/telemetry")>(),
  startKitchenTelemetry: telemetryMocks.start,
  flushKitchenTelemetry: telemetryMocks.flush,
}));

const mockGetKitchenContext = vi.fn();
const mockAddKitchenItems = vi.fn();
const mockEditKitchenItems = vi.fn();
const mockRemoveKitchenItems = vi.fn();

vi.mock("@/lib/kitchen-commands", () => ({
  addKitchenItems: (...args: unknown[]) => mockAddKitchenItems(...args),
  editKitchenItems: (...args: unknown[]) => mockEditKitchenItems(...args),
  removeKitchenItems: (...args: unknown[]) => mockRemoveKitchenItems(...args),
}));

vi.mock("@/lib/kitchen-service", () => ({
  getKitchenContext: (...args: unknown[]) => mockGetKitchenContext(...args),
  createPantryItem: vi.fn(),
  updatePantryItem: vi.fn(),
  deletePantryItem: vi.fn(),
  createKitchenTool: vi.fn(),
  updateKitchenTool: vi.fn(),
  deleteKitchenTool: vi.fn(),
  setPantryItemQuantity: vi.fn(),
  adjustPantryItemQuantity: vi.fn(),
  adjustPantryItemQuantities: vi.fn(),
  applyReviewedReceiptImport: vi.fn(),
}));

vi.mock("@/mcp/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mcp/auth")>();
  return {
    ...actual,
    verifyMcpAccessToken: vi.fn(async (token: string) => {
      if (token !== "valid-test-token") {
        throw new Error("Invalid test access token.");
      }
      return {
        token,
        clientId: "chatgpt-test-client",
        scopes: ["openid"],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        resource: new URL("https://mcp.mise.example/mcp"),
        extra: { userId: "user-123" },
      };
    }),
  };
});

describe("Hono Cloudflare Worker MCP server", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.MCP_PUBLIC_URL = "https://mcp.mise.example/mcp";
    process.env.MISE_TOOL_SURFACE = "four";

    mockGetKitchenContext.mockReset();
    mockGetKitchenContext.mockResolvedValue({
      pantry: [
        {
          id: 1,
          name: "Rice",
          quantity: "2 cup",
          quantityMode: "structured",
          quantityAmount: "2",
          quantityUnit: "cup",
          turnover: "high",
        },
      ],
      tools: [
        {
          id: "00000000-0000-4000-8000-000000000020",
          name: "Dutch oven",
          kind: "cookware",
        },
      ],
    });
  });

  describe("Health check routes", () => {
    it("returns healthy status on GET /", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        status: "healthy",
        runtime: "cloudflare-workers",
        service: "mise-mcp",
      });
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("returns healthy status on GET /health", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        status: "healthy",
        runtime: "cloudflare-workers",
        service: "mise-mcp",
      });
    });

    it("returns healthy status on GET /api/mcp/health", async () => {
      const res = await app.request("/api/mcp/health");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        status: "healthy",
        runtime: "cloudflare-workers",
        service: "mise-mcp",
      });
    });
  });

  describe("OAuth Discovery Metadata", () => {
    it("serves OAuth protected resource metadata on RFC 8414 endpoints", async () => {
      for (const path of [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
        "/api/mcp/oauth-protected-resource",
      ]) {
        const res = await app.request(path);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-store");
        const meta = await res.json();
        expect(meta.resource).toBe("https://mcp.mise.example/mcp");
        expect(meta.authorization_servers).toEqual([
          "https://project.supabase.co/auth/v1",
        ]);
        expect(meta.scopes_supported).toEqual(["openid"]);
      }
    });

    it("serves Supabase OAuth authorization server metadata", async () => {
      for (const path of [
        "/.well-known/oauth-authorization-server",
        "/api/mcp/oauth-authorization-server",
      ]) {
        const res = await app.request(path);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-store");
        const meta = await res.json();
        expect(meta.issuer).toBe("https://project.supabase.co/auth/v1");
        expect(meta.authorization_endpoint).toBe(
          "https://project.supabase.co/auth/v1/oauth/authorize",
        );
        expect(meta.token_endpoint).toBe(
          "https://project.supabase.co/auth/v1/oauth/token",
        );
      }
    });
  });

  describe("CORS and HTTP Method Enforcement", () => {
    it("handles OPTIONS preflight for /mcp with dual-era headers", async () => {
      const res = await app.request("/mcp", { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
      expect(res.headers.get("access-control-allow-headers")).toContain("MCP-Protocol-Version");
      expect(res.headers.get("access-control-allow-headers")).toContain("Mcp-Method");
      expect(res.headers.get("access-control-expose-headers")).toContain("Mcp-Method");
    });

    it("rejects non-POST MCP calls with 405 Method Not Allowed", async () => {
      for (const method of ["GET", "DELETE"] as const) {
        const res = await app.request("/mcp", { method });
        expect(res.status).toBe(405);
        const body = await res.json();
        expect(body).toEqual({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed." },
          id: null,
        });
      }
    });
  });

  describe("MCP Authentication and Execution", () => {
    it("challenges unauthenticated MCP requests with RFC 6750 401", async () => {
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-11-25",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("Bearer resource_metadata=");
      expect(res.headers.get("www-authenticate")).toContain("scope=\"openid\"");
      const body = await res.json();
      expect(body.error).toBe("authorization_required");
    });

    it("challenges invalid bearer token with invalid_token error", async () => {
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-11-25",
          authorization: "Bearer invalid-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
    });

    it("authenticates and lists the 4 composable tools with securitySchemes", async () => {
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-11-25",
          authorization: "Bearer valid-test-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result).toBeDefined();
      const toolNames = body.result.tools.map((t: { name: string }) => t.name);
      expect(toolNames).toEqual([
        "read_kitchen",
        "add_items",
        "edit_items",
        "remove_items",
      ]);

      for (const tool of body.result.tools) {
        expect(tool.securitySchemes).toEqual([
          { type: "oauth2", scopes: ["openid"] },
        ]);
      }
    });

    it("executes read_kitchen tool through the worker with authenticated identity", async () => {
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-protocol-version": "2025-11-25",
          authorization: "Bearer valid-test-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "read_kitchen",
            arguments: {},
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result).toBeDefined();
      expect(body.result.isError).toBeUndefined();
      expect(mockGetKitchenContext).toHaveBeenCalledWith("user-123");
      expect(body.result.structuredContent).toBeDefined();
      expect(body.result.structuredContent.pantry[0].name).toBe("Rice");
      expect(body.result.structuredContent.tools[0].name).toBe("Dutch oven");
    });

    it("handles modern 2026-07-28 protocol requests with SEP-2243 headers", async () => {
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-session-id": "session-edge-42",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "server/discover",
          authorization: "Bearer valid-test-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "server/discover",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result).toBeDefined();
      expect(body.result.supportedVersions).toContain("2026-07-28");
    });

    it("populates process.env from worker env bindings and triggers waitUntil", async () => {
      const waitUntilMock = vi.fn();
      const mockEnv = {
        CUSTOM_WORKER_VAR: "test-value",
      };

      const res = await app.fetch(
        new Request("http://localhost/health"),
        mockEnv,
        {
          waitUntil: waitUntilMock,
          passThroughOnException: vi.fn(),
        } as any,
      );

      expect(res.status).toBe(200);
      expect(process.env.CUSTOM_WORKER_VAR).toBe("test-value");
    });
  });
});


describe("Worker telemetry lifetime", () => {
  it("starts the provider and returns a response while its waitUntil flush is pending", async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    telemetryMocks.flush.mockReturnValueOnce(pending);
    const waitUntil = vi.fn();
    const response = await app.request("/mcp", { method: "POST" }, {}, {
      waitUntil, passThroughOnException: vi.fn(), props: {},
    });
    expect(response.status).toBe(401);
    expect(telemetryMocks.start).toHaveBeenCalledWith({ runtime: "cloudflare-workers" });
    expect(waitUntil).toHaveBeenCalledWith(pending);
    finish();
    await pending;
  });
});
