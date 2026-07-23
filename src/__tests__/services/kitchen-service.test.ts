import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeItem } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/db", () => ({
  addItem: vi.fn(),
  addKitchenTool: vi.fn(),
  deleteItem: vi.fn(),
  deleteKitchenTool: vi.fn(),
  getItemById: vi.fn(),
  getItemByCanonicalName: vi.fn(),
  getItems: vi.fn(),
  getKitchenTools: vi.fn(),
  setItemQuantity: vi.fn(),
  updateItem: vi.fn(),
  updateKitchenTool: vi.fn(),
}));

import {
  addItem,
  addKitchenTool,
  deleteItem,
  deleteKitchenTool as deleteKitchenToolRecord,
  getItemById,
  getItemByCanonicalName,
  getItems,
  getKitchenTools,
  setItemQuantity,
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
const mockGetItemById = vi.mocked(getItemById);
const mockGetItemByCanonicalName = vi.mocked(getItemByCanonicalName);
const mockGetItems = vi.mocked(getItems);
const mockGetKitchenTools = vi.mocked(getKitchenTools);
const mockSetItemQuantity = vi.mocked(setItemQuantity);
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
    const item = fakeItem();
    mockAddItem.mockResolvedValue({ status: "created", item });

    await expect(createPantryItem("user-123", {
      name: "  eggs  ",
      quantity: " 12 ",
    })).resolves.toEqual({
      ok: true,
      value: { status: "created", item },
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      "user-123",
      "eggs",
      "12",
      "high",
    );
  });

  it("returns the existing row when canonical creation identity already exists", async () => {
    const item = fakeItem({ name: "Eggs", name_key: "eggs" });
    mockAddItem.mockResolvedValue({ status: "already_exists", item });

    await expect(createPantryItem("user-123", {
      name: "  Ｅｇｇｓ ",
      quantity: "6",
    })).resolves.toEqual({
      ok: true,
      value: { status: "already_exists", item },
    });
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
    [{ name: "paprika", quantity: 2 }, "quantity must be a string"],
    [
      { name: "paprika", quantity: "a".repeat(101) },
      "quantity must be 100 characters or fewer",
    ],
  ])("rejects invalid creation input %#", async (input, error) => {
    await expect(createPantryItem("user-123", input)).resolves.toEqual({
      ok: false,
      error,
    });
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it("normalizes optional update fields and delegates as the user", async () => {
    const current = fakeItem();
    const updated = fakeItem({
      name: "duck eggs",
      name_key: "duck eggs",
      quantity: "6",
      turnover: "low",
    });
    mockGetItemById.mockResolvedValue(current);
    mockGetItemByCanonicalName.mockResolvedValue(null);
    mockUpdateItem.mockResolvedValue({ status: "updated", item: updated });

    await expect(updatePantryItem("user-123", {
      id: 1,
      name: " duck eggs ",
      quantity: " 6 ",
      turnover: "low",
    })).resolves.toEqual({
      ok: true,
      value: { status: "updated", item: updated },
    });
    expect(mockGetItemById).toHaveBeenCalledWith("user-123", 1);
    expect(mockGetItemByCanonicalName).toHaveBeenCalledWith(
      "user-123",
      "duck eggs",
    );
    expect(mockUpdateItem).toHaveBeenCalledWith(
      "user-123",
      1,
      {
        name: "duck eggs",
        quantity: "6",
        turnover: "low",
      },
    );
  });

  it("delegates only changed fields so omitted fields cannot be overwritten", async () => {
    const current = fakeItem({ name: "Eggs", quantity: "12" });
    const renamed = fakeItem({ name: "Duck eggs", quantity: "6" });
    mockGetItemById.mockResolvedValue(current);
    mockGetItemByCanonicalName.mockResolvedValue(null);
    mockUpdateItem.mockResolvedValue({ status: "updated", item: renamed });

    await updatePantryItem("user-123", {
      id: 1,
      name: "Duck eggs",
    });

    expect(mockUpdateItem).toHaveBeenCalledWith(
      "user-123",
      1,
      { name: "Duck eggs" },
    );
  });

  it("preserves omitted fields and reports an unchanged update without writing", async () => {
    const current = fakeItem({ name: "Eggs", name_key: "eggs" });
    mockGetItemById.mockResolvedValue(current);

    await expect(updatePantryItem("user-123", {
      id: 1,
      name: "Eggs",
    })).resolves.toEqual({
      ok: true,
      value: { status: "unchanged", item: current },
    });
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("returns not found before attempting an update", async () => {
    mockGetItemById.mockResolvedValue(null);

    await expect(updatePantryItem("user-123", {
      id: 42,
      quantity: "6",
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", id: 42 },
    });
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("returns a canonical rename conflict without writing", async () => {
    const current = fakeItem({ id: 1, name: "Milk", name_key: "milk" });
    const eggs = fakeItem({ id: 2, name: "Eggs", name_key: "eggs" });
    mockGetItemById.mockResolvedValue(current);
    mockGetItemByCanonicalName.mockResolvedValue(eggs);

    await expect(updatePantryItem("user-123", {
      id: 1,
      name: "  ＥＧＧＳ ",
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "name_conflict",
        id: 1,
        conflictingItem: eggs,
      },
    });
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it.each([
    [{ quantity: "6" }, "id must be a positive integer"],
    [{ id: "1", quantity: "6" }, "id must be a positive integer"],
    [{ id: 0, quantity: "6" }, "id must be a positive integer"],
    [{ id: 1, name: "   " }, "name is required"],
    [
      { id: 1, name: "a".repeat(101) },
      "name must be 100 characters or fewer",
    ],
    [{ id: 1, turnover: "medium" }, "turnover must be high or low"],
    [{ id: 1, quantity: null }, "quantity must be a string"],
    [
      { id: 1, quantity: "a".repeat(101) },
      "quantity must be 100 characters or fewer",
    ],
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
      error: "id must be a positive integer",
    });
    await expect(deletePantryItem("user-123", { id: 7 })).resolves.toEqual({
      ok: true,
      value: null,
    });
    expect(mockDeleteItem).toHaveBeenCalledWith("user-123", 7);
  });

  it("sets an unambiguous pantry quantity after normalized name matching", async () => {
    const eggs = fakeItem({
      id: 7,
      name: "Duck   Eggs",
      name_key: "duck eggs",
      quantity: "12",
    });
    mockGetItemByCanonicalName.mockResolvedValue(eggs);
    mockSetItemQuantity.mockResolvedValue({
      status: "updated",
      item: { ...eggs, quantity: "6" },
    });

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
    expect(mockGetItemByCanonicalName).toHaveBeenCalledWith(
      "user-123",
      "duck eggs",
    );
    expect(mockSetItemQuantity).toHaveBeenCalledWith(
      "user-123",
      7,
      "6",
    );
  });

  it("treats an identical repeated quantity as unchanged without another write", async () => {
    mockGetItemByCanonicalName.mockResolvedValue(
      fakeItem({ id: 7, name: "Eggs", quantity: "6" }),
    );

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
    expect(mockSetItemQuantity).not.toHaveBeenCalled();
  });

  it("returns not found if the matched item disappears before the update", async () => {
    mockGetItemByCanonicalName.mockResolvedValue(
      fakeItem({ id: 7, name: "Eggs", quantity: "12" }),
    );
    mockSetItemQuantity.mockResolvedValue({ status: "not_found" });

    await expect(setPantryItemQuantity("user-123", {
      name: "Eggs",
      quantity: "6",
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", name: "Eggs" },
    });
    expect(mockSetItemQuantity).toHaveBeenCalledWith(
      "user-123",
      7,
      "6",
    );
  });

  it("returns not found without writing or creating an item", async () => {
    mockGetItemByCanonicalName.mockResolvedValue(null);

    await expect(setPantryItemQuantity("user-123", {
      name: "Eggs",
      quantity: "6",
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", name: "Eggs" },
    });
    expect(mockSetItemQuantity).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
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
    expect(mockGetItemByCanonicalName).not.toHaveBeenCalled();
    expect(mockSetItemQuantity).not.toHaveBeenCalled();
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
