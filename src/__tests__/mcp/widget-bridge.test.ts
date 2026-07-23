import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createKitchenWidgetApp } from "@/mcp/widget/bridge";

describe("Mise MCP Apps widget bridge", () => {
  it("initializes before receiving a tool result through the standard bridge", async () => {
    const onToolResult = vi.fn();
    const app = createKitchenWidgetApp({
      autoResize: false,
      onHostContextChanged: vi.fn(),
      onToolResult,
    });
    const bridge = new AppBridge(
      null,
      { name: "mise-widget-test-host", version: "1.0.0" },
      {},
    );
    const [appTransport, hostTransport] = InMemoryTransport.createLinkedPair();
    const initialized = new Promise<void>((resolve) => {
      bridge.oninitialized = () => resolve();
    });
    const kitchen = {
      pantry: [{ name: "Rice", quantity: "2 cups", turnover: "high" }],
      tools: [{ name: "Dutch oven", kind: "cookware" }],
    };

    try {
      await bridge.connect(hostTransport);
      await app.connect(appTransport);
      await initialized;
      await bridge.sendToolInput({ arguments: {} });
      await bridge.sendToolResult({
        content: [
          { type: "text", text: "Returned your Mise kitchen context." },
        ],
        structuredContent: kitchen,
      });

      expect(onToolResult).toHaveBeenCalledOnce();
      expect(onToolResult).toHaveBeenCalledWith(kitchen);
    } finally {
      await app.close();
      await bridge.close();
    }
  });
});
