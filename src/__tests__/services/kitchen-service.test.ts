import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeItem } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/db", () => ({
  addItem: vi.fn(),
  addKitchenTool: vi.fn(),
  deleteItem: vi.fn(),
  deleteKitchenTool: vi.fn(),
  getItems: vi.fn(),
  getKitchenTools: vi.fn(),
  updateItem: vi.fn(),
  updateKitchenTool: vi.fn(),
}));

import {
  addItem,
  addKitchenTool,
  deleteItem,
  deleteKitchenTool as deleteKitchenToolRecord,
  getItems,
  getKitchenTools,
  updateItem,
  updateKitchenTool as updateKitchenToolRecord,
} from "@/lib/db";
import {
  createKitchenTool,
  createPantryItem,
  deleteKitchenTool,
  deletePantryItem,
  getKitchenContext,
  listKitchenTools,
  listPantryItems,
  setPantryItemQuantity,
  updateKitchenTool,
  updatePantryItem,
} from "@/lib/kitchen-service";

const mockAddItem = vi.mocked(addItem);
const mockAddKitchenTool = vi.mocked(addKitchenTool);
const mockDeleteItem = vi.mocked(deleteItem);
const mockDeleteKitchenTool = vi.mocked(deleteKitchenToolRecord);
const mockGetItems = vi.mocked(getItems);
const mockGetKitchenTools = vi.mocked(getKitchenTools);
const mockUpdateItem = vi.mocked(updateItem);
const mockUpdateKitchenTool = vi.mocked(updateKitchenToolRecord);

const tool = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "user-123",
  name: "Air fryer",
  kind: "appliance",
  created_at: "2026-07-22T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("kitchen reads", () => {
  it("delegates website lists with the authenticated user ID", async () => {
    mockGetItems.mockResolvedValue([fakeItem()]);
    mockGetKitchenTools.mockResolvedValue([tool]);

    await expect(listPantryItems("user-123")).resolves.toEqual([fakeItem()]);
    await expect(listKitchenTools("user-123")).resolves.toEqual([tool]);
    expect(mockGetItems).toHaveBeenCalledWith("user-123");
    expect(mockGetKitchenTools).toHaveBeenCalledWith("user-123");
  });

  it("projects the same user-scoped reads into connector-safe fields", async () => {
    mockGetItems.mockResolvedValue([
      fakeItem({
        id: 42,
        name: "Rice",
        quantity: "2 cups",
        turnover: "high",
      }),
    ]);
    mockGetKitchenTools.mockResolvedValue([
      { ...tool, name: "Dutch oven", kind: "cookware" },
    ]);

    await expect(getKitchenContext("user-123")).resolves.toEqual({
      pantry: [{ name: "Rice", quantity: "2 cups", turnover: "high" }],
      tools: [{ name: "Dutch oven", kind: "cookware" }],
    });
    expect(mockGetItems).toHaveBeenCalledWith("user-123");
    expect(mockGetKitchenTools).toHaveBeenCalledWith("user-123");
  });
});

describe("pantry commands", () => {
  it("normalizes creation input and applies the existing turnover default", async () => {
    mockAddItem.mockResolvedValue(fakeItem());

    await expect(createPantryItem("user-123", {
      name: "  eggs  ",
      quantity: " 12 ",
    })).resolves.toEqual({ ok: true, value: fakeItem() });
    expect(mockAddItem).toHaveBeenCalledWith(
      "user-123",
      "eggs",
      "12",
      "high",
    );
  });

  it.each([
    [{}, "name is required"],
    [{ name: "   " }, "name is required"],
    [{ name: 42 }, "name is required"],
    [
      { name: "a".repeat(101) },
      "name must be 100 characters or fewer",
    ],
    [
      { name: "paprika", turnover: "medium" },
      "turnover must be high or low",
    ],
  ])("rejects invalid creation input %#", async (input, error) => {
    await expect(createPantryItem("user-123", input)).resolves.toEqual({
      ok: false,
      error,
    });
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it("normalizes optional update fields and delegates as the user", async () => {
    const updated = fakeItem({
      name: "duck eggs",
      quantity: "6",
      turnover: "low",
    });
    mockUpdateItem.mockResolvedValue(updated);

    await expect(updatePantryItem("user-123", {
      id: 1,
      name: " duck eggs ",
      quantity: " 6 ",
      turnover: "low",
    })).resolves.toEqual({ ok: true, value: updated });
    expect(mockUpdateItem).toHaveBeenCalledWith(
      "user-123",
      1,
      "6",
      "duck eggs",
      "low",
    );
  });

  it.each([
    [{ quantity: "6" }, "id is required"],
    [{ id: 1, name: "   " }, "name is required"],
    [
      { id: 1, name: "a".repeat(101) },
      "name must be 100 characters or fewer",
    ],
    [{ id: 1, turnover: "medium" }, "turnover must be high or low"],
  ])("rejects invalid update input %#", async (input, error) => {
    await expect(updatePantryItem("user-123", input)).resolves.toEqual({
      ok: false,
      error,
    });
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("validates then delegates deletion as the user", async () => {
    await expect(deletePantryItem("user-123", {})).resolves.toEqual({
      ok: false,
      error: "id is required",
    });
    await expect(deletePantryItem("user-123", { id: 7 })).resolves.toEqual({
      ok: true,
      value: null,
    });
    expect(mockDeleteItem).toHaveBeenCalledWith("user-123", 7);
  });

  it("sets an unambiguous pantry quantity after normalized name matching", async () => {
    const eggs = fakeItem({ id: 7, name: "Duck   Eggs", quantity: "12" });
    mockGetItems.mockResolvedValue([eggs]);
    mockUpdateItem.mockResolvedValue({ ...eggs, quantity: "6" });

    await expect(setPantryItemQuantity("user-123", {
      name: "  duck eggs ",
      quantity: " 6 ",
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "updated",
        name: "Duck   Eggs",
        beforeQuantity: "12",
        quantity: "6",
      },
    });
    expect(mockGetItems).toHaveBeenCalledWith("user-123");
    expect(mockUpdateItem).toHaveBeenCalledWith("user-123", 7, "6");
  });

  it("treats an identical repeated quantity as unchanged without another write", async () => {
    mockGetItems.mockResolvedValue([
      fakeItem({ id: 7, name: "Eggs", quantity: "6" }),
    ]);

    await expect(setPantryItemQuantity("user-123", {
      name: "eggs",
      quantity: "6",
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "unchanged",
        name: "Eggs",
        beforeQuantity: "6",
        quantity: "6",
      },
    });
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("returns not found if the matched item disappears before the update", async () => {
    mockGetItems.mockResolvedValue([
      fakeItem({ id: 7, name: "Eggs", quantity: "12" }),
    ]);
    mockUpdateItem.mockResolvedValue(undefined as never);

    await expect(setPantryItemQuantity("user-123", {
      name: "Eggs",
      quantity: "6",
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", name: "Eggs" },
    });
    expect(mockUpdateItem).toHaveBeenCalledWith("user-123", 7, "6");
  });

  it("returns not found without writing or creating an item", async () => {
    mockGetItems.mockResolvedValue([
      fakeItem({ name: "Milk", quantity: "1 gallon" }),
    ]);

    await expect(setPantryItemQuantity("user-123", {
      name: "Eggs",
      quantity: "6",
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", name: "Eggs" },
    });
    expect(mockUpdateItem).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it("returns ambiguity without writing when normalized names collide", async () => {
    mockGetItems.mockResolvedValue([
      fakeItem({ id: 7, name: "Eggs", quantity: "12" }),
      fakeItem({ id: 8, name: " eggs ", quantity: "6" }),
    ]);

    await expect(setPantryItemQuantity("user-123", {
      name: "EGGS",
      quantity: "4",
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "ambiguous",
        name: "EGGS",
        matchCount: 2,
      },
    });
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it.each([
    [{ quantity: "6" }, "name is required"],
    [{ name: "Eggs" }, "quantity is required"],
    [{ name: "Eggs", quantity: "   " }, "quantity is required"],
    [
      { name: "Eggs", quantity: "a".repeat(101) },
      "quantity must be 100 characters or fewer",
    ],
  ])("rejects invalid set-quantity input %#", async (input, error) => {
    await expect(
      setPantryItemQuantity("user-123", input),
    ).resolves.toEqual({ ok: false, error });
    expect(mockGetItems).not.toHaveBeenCalled();
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });
});

describe("kitchen-tool commands", () => {
  it("normalizes creation input and delegates as the user", async () => {
    mockAddKitchenTool.mockResolvedValue(tool);

    await expect(createKitchenTool("user-123", {
      name: " Air fryer ",
      kind: " appliance ",
    })).resolves.toEqual({ ok: true, value: tool });
    expect(mockAddKitchenTool).toHaveBeenCalledWith(
      "user-123",
      "Air fryer",
      "appliance",
    );
  });

  it.each([
    [{ kind: "appliance" }, "name is required"],
    [{ name: "Air fryer" }, "kind is required"],
    [
      { name: "a".repeat(101), kind: "appliance" },
      "name must be 100 characters or fewer",
    ],
    [
      { name: "Air fryer", kind: "a".repeat(51) },
      "kind must be 50 characters or fewer",
    ],
  ])("rejects invalid tool creation input %#", async (input, error) => {
    await expect(createKitchenTool("user-123", input)).resolves.toEqual({
      ok: false,
      error,
    });
    expect(mockAddKitchenTool).not.toHaveBeenCalled();
  });

  it("normalizes and delegates tool updates as the user", async () => {
    const updated = { ...tool, name: "Convection oven" };
    mockUpdateKitchenTool.mockResolvedValue(updated);

    await expect(updateKitchenTool("user-123", {
      id: tool.id,
      name: " Convection oven ",
      kind: " appliance ",
    })).resolves.toEqual({ ok: true, value: updated });
    expect(mockUpdateKitchenTool).toHaveBeenCalledWith(
      "user-123",
      tool.id,
      "Convection oven",
      "appliance",
    );
  });

  it("validates then delegates tool deletion as the user", async () => {
    await expect(deleteKitchenTool("user-123", {})).resolves.toEqual({
      ok: false,
      error: "id is required",
    });
    await expect(deleteKitchenTool("user-123", {
      id: tool.id,
    })).resolves.toEqual({ ok: true, value: null });
    expect(mockDeleteKitchenTool).toHaveBeenCalledWith("user-123", tool.id);
  });
});
