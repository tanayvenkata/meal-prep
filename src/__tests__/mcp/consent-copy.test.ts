import { describe, expect, it } from "vitest";
import { MCP_CONSENT_COPY } from "@/mcp/consent-copy";

describe("Mise MCP consent contract", () => {
  it("discloses quantity actions and their excluded mutations", () => {
    expect(MCP_CONSENT_COPY.summary).toContain(
      "set, consume, or restock the quantity of one existing pantry item",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "decreasing it for consumed ingredients",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain("increasing it for restocks");
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "cannot create, rename, or delete pantry items",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "or change kitchen tools",
    );
  });
});
