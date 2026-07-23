import { describe, expect, it } from "vitest";
import { MCP_CONSENT_COPY } from "@/mcp/consent-copy";

describe("Mise MCP consent contract", () => {
  it("discloses reviewed receipt additions and their excluded mutations", () => {
    expect(MCP_CONSENT_COPY.summary).toContain(
      "reviewed receipt additions",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "atomically decrease consumed ingredients",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain("increase restocks");
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "create pantry items only from exact receipt lines",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain("review and confirm");
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "cannot rename or delete pantry items",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain("convert units");
    expect(MCP_CONSENT_COPY.boundary).toContain("infer receipt decisions");
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "or change kitchen tools",
    );
  });
});
