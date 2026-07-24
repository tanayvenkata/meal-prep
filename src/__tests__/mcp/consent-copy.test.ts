import { describe, expect, it } from "vitest";
import { MCP_CONSENT_COPY } from "@/mcp/consent-copy";

describe("Mise MCP consent contract", () => {
  it("discloses kitchen lifecycle access and its boundaries", () => {
    expect(MCP_CONSENT_COPY.summary).toContain(
      "reviewed receipt additions",
    );
    expect(MCP_CONSENT_COPY.boundary).toContain("create, edit, and delete");
    expect(MCP_CONSENT_COPY.boundary).toContain("pantry items and kitchen tools");
    expect(MCP_CONSENT_COPY.boundary).toContain("atomically adjust quantities");
    expect(MCP_CONSENT_COPY.boundary).toContain("review and confirm");
    expect(MCP_CONSENT_COPY.boundary).toContain("convert units");
    expect(MCP_CONSENT_COPY.boundary).toContain("infer receipt decisions");
    expect(MCP_CONSENT_COPY.boundary).toContain("access another kitchen");
    expect(MCP_CONSENT_COPY.boundary).toContain(
      "manage conversations and account data",
    );
  });
});
