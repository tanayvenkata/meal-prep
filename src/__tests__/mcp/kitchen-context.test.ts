import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getItems: vi.fn(),
  getKitchenTools: vi.fn(),
}));

import { getItems, getKitchenTools } from "@/lib/db";
import { loadKitchenContext } from "@/mcp/kitchen-context";

const mockGetItems = vi.mocked(getItems);
const mockGetKitchenTools = vi.mocked(getKitchenTools);

beforeEach(() => vi.clearAllMocks());

describe("loadKitchenContext", () => {
  it("queries as the signed-in user and returns only connector-safe fields", async () => {
    mockGetItems.mockResolvedValue([
      {
        id: 42,
        user_id: "user-123",
        name: "Rice",
        quantity: "2 cups",
        turnover: "high",
        created_at: "2026-07-22T00:00:00Z",
      },
    ]);
    mockGetKitchenTools.mockResolvedValue([
      {
        id: "private-tool-id",
        user_id: "user-123",
        name: "Dutch oven",
        kind: "cookware",
        created_at: "2026-07-22T00:00:00Z",
      },
    ]);

    await expect(loadKitchenContext("user-123")).resolves.toEqual({
      pantry: [{ name: "Rice", quantity: "2 cups", turnover: "high" }],
      tools: [{ name: "Dutch oven", kind: "cookware" }],
    });
    expect(mockGetItems).toHaveBeenCalledWith("user-123");
    expect(mockGetKitchenTools).toHaveBeenCalledWith("user-123");
  });
});
