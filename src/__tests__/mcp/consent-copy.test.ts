import { describe, expect, it } from "vitest";
import { MCP_CONSENT_COPY } from "@/mcp/consent-copy";

describe("Mise MCP consent contract", () => {
  it("discloses quantity actions and their excluded mutations", () => {
    expect(MCP_CONSENT_COPY.summary).toContain(
      "consume and restock one or several existing pantry items",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "atomically decreasing consumed ingredients",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain("increasing restocks");
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "cannot create, rename, or delete pantry items",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain("convert units");
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "or change kitchen tools",
    );
  });
});
