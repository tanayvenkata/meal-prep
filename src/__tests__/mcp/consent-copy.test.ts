import { describe, expect, it } from "vitest";
import { MCP_CONSENT_COPY } from "@/mcp/consent-copy";

describe("Mise MCP consent contract", () => {
  it("discloses the exact-quantity action and its excluded mutations", () => {
    expect(MCP_CONSENT_COPY.summary).toContain(
      "set the exact quantity of one existing pantry item",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "only the quantity of an existing pantry item",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "cannot create, rename, or delete pantry items",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "or change kitchen tools",
    );
  });
});
