import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeItem } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/db", () => ({
  adjustItemQuantityByCanonicalName: vi.fn(),
  addItem: vi.fn(),
  addKitchenTool: vi.fn(),
  deleteItem: vi.fn(),
  deleteKitchenTool: vi.fn(),
  getItemById: vi.fn(),
  getItemByCanonicalName: vi.fn(),
  getItems: vi.fn(),
  getKitchenTools: vi.fn(),
  setItemQuantityByCanonicalName: vi.fn(),
  updateItem: vi.fn(),
  updateKitchenTool: vi.fn(),
}));

import {
  adjustItemQuantityByCanonicalName,
  addItem,
  addKitchenTool,
  deleteItem,
  deleteKitchenTool as deleteKitchenToolRecord,
  getItemById,
  getItemByCanonicalName,
  getItems,
  getKitchenTools,
  setItemQuantityByCanonicalName,
  updateItem,
  updateKitchenTool as updateKitchenToolRecord,
} from "@/lib/db";
import {
  adjustPantryItemQuantity,
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

const mockAdjustItemQuantity = vi.mocked(adjustItemQuantityByCanonicalName);
const mockAddItem = vi.mocked(addItem);
const mockAddKitchenTool = vi.mocked(addKitchenTool);
const mockDeleteItem = vi.mocked(deleteItem);
const mockDeleteKitchenTool = vi.mocked(deleteKitchenToolRecord);
const mockGetItemById = vi.mocked(getItemById);
const mockGetItemByCanonicalName = vi.mocked(getItemByCanonicalName);
const mockGetItems = vi.mocked(getItems);
const mockGetKitchenTools = vi.mocked(getKitchenTools);
const mockSetItemQuantity = vi.mocked(setItemQuantityByCanonicalName);
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
        quantity: "2 cup",
        quantity_text: "",
        quantity_value: "2.000000",
        quantity_unit: "cup",
        turnover: "high",
      }),
      fakeItem({
        id: 43,
        name: "Milk",
        quantity: "2 cups",
        quantity_text: "2 cups",
        quantity_value: null,
        quantity_unit: null,
        turnover: "low",
      }),
      fakeItem({
        id: 44,
        name: "Salt",
        quantity: "",
        quantity_text: "",
        quantity_value: null,
        quantity_unit: null,
        turnover: "high",
      }),
      fakeItem({
        id: 45,
        name: "Protein powder",
        quantity: "4 scoop",
        quantity_text: "",
        quantity_value: "4",
        quantity_unit: "scoop",
        turnover: "high",
      }),
      fakeItem({
        id: 46,
        name: "Eggs",
        quantity: "6",
        quantity_text: "",
        quantity_value: "6",
        quantity_unit: "count",
        turnover: "high",
      }),
    ]);
    mockGetKitchenTools.mockResolvedValue([
      { ...tool, name: "Dutch oven", kind: "cookware" },
    ]);

    await expect(getKitchenContext("user-123")).resolves.toEqual({
      pantry: [
        {
          name: "Rice",
          quantity: "2 cup",
          turnover: "high",
          quantityMode: "structured",
          quantityAmount: "2.000000",
          quantityUnit: "cup",
        },
        {
          name: "Milk",
          quantity: "2 cups",
          turnover: "low",
          quantityMode: "text",
          quantityAmount: null,
          quantityUnit: null,
        },
        {
          name: "Salt",
          quantity: "",
          turnover: "high",
          quantityMode: "unknown",
          quantityAmount: null,
          quantityUnit: null,
        },
        {
          name: "Protein powder",
          quantity: "4 scoop",
          turnover: "high",
          quantityMode: "unsupported",
          quantityAmount: "4",
          quantityUnit: "scoop",
        },
        {
          name: "Eggs",
          quantity: "6",
          turnover: "high",
          quantityMode: "structured",
          quantityAmount: "6",
          quantityUnit: "count",
        },
      ],
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
      {
        mode: "text",
        amount: null,
        unit: null,
        text: "12",
      },
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

  it("stores recognized fractions structurally and preserves unknown wording", async () => {
    const item = fakeItem();
    mockAddItem.mockResolvedValue({ status: "created", item });

    await createPantryItem("user-123", {
      name: "Frozen vegetables",
      quantity: "1/2 bags",
    });
    await createPantryItem("user-123", {
      name: "Milk",
      quantity: "half gallon",
    });

    expect(mockAddItem).toHaveBeenNthCalledWith(
      1,
      "user-123",
      "Frozen vegetables",
      {
        mode: "structured",
        amount: "0.5",
        unit: "bag",
        text: null,
      },
      "high",
    );
    expect(mockAddItem).toHaveBeenNthCalledWith(
      2,
      "user-123",
      "Milk",
      {
        mode: "text",
        amount: null,
        unit: null,
        text: "half gallon",
      },
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
    [{ name: "paprika", quantity: 2 }, "quantity must be a string"],
    [
      { name: "paprika", quantity: "a".repeat(101) },
      "quantity must be 100 characters or fewer",
    ],
    [
      { name: "paprika", quantity: "-1 count" },
      "quantity amount cannot be negative",
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
        quantity: {
          mode: "text",
          amount: null,
          unit: null,
          text: "6",
        },
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

  it("treats an equivalent structured unit alias as unchanged", async () => {
    const current = fakeItem({
      name: "Flour",
      quantity: "2 lb",
      quantity_text: "",
      quantity_value: "2",
      quantity_unit: "lb",
    });
    mockGetItemById.mockResolvedValue(current);

    await expect(updatePantryItem("user-123", {
      id: 1,
      quantity: "2 pounds",
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
    mockSetItemQuantity.mockResolvedValue({
      status: "updated",
      item: { ...eggs, quantity: "6" },
      beforeQuantity: "12",
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
    expect(mockSetItemQuantity).toHaveBeenCalledWith(
      "user-123",
      "duck eggs",
      {
        mode: "text",
        amount: null,
        unit: null,
        text: "6",
      },
    );
  });

  it("treats an identical repeated quantity as unchanged without another write", async () => {
    mockSetItemQuantity.mockResolvedValue({
      status: "unchanged",
      item: fakeItem({ id: 7, name: "Eggs", quantity: "6" }),
      beforeQuantity: "6",
    });

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
    expect(mockSetItemQuantity).toHaveBeenCalledWith(
      "user-123",
      "eggs",
      {
        mode: "text",
        amount: null,
        unit: null,
        text: "6",
      },
    );
  });

  it("returns not found if the matched item disappears before the update", async () => {
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
      "Eggs",
      {
        mode: "text",
        amount: null,
        unit: null,
        text: "6",
      },
    );
  });

  it("returns not found without writing or creating an item", async () => {
    mockSetItemQuantity.mockResolvedValue({ status: "not_found" });

    await expect(setPantryItemQuantity("user-123", {
      name: "Eggs",
      quantity: "6",
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", name: "Eggs" },
    });
    expect(mockSetItemQuantity).toHaveBeenCalled();
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

describe("pantry quantity adjustments", () => {
  const expected = {
    mode: "structured" as const,
    amount: "12",
    unit: "count" as const,
    text: null,
  };
  const delta = {
    mode: "structured" as const,
    amount: "2",
    unit: "count" as const,
    text: null,
  };

  it("normalizes and delegates an applied consume command", async () => {
    const item = fakeItem({
      name: "Duck Eggs",
      quantity: "10",
      quantity_text: "",
      quantity_value: "10",
      quantity_unit: "count",
    });
    mockAdjustItemQuantity.mockResolvedValue({
      status: "applied",
      item,
      beforeQuantity: "12",
      afterQuantity: "10",
      before: expected,
      after: { ...expected, amount: "10" },
    });

    await expect(adjustPantryItemQuantity("user-123", {
      name: "  duck eggs ",
      operation: "consume",
      expectedQuantity: "12 counts",
      deltaQuantity: "2 count",
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "applied",
        operation: "consume",
        name: "Duck Eggs",
        beforeQuantity: "12",
        quantity: "10",
        before: expected,
        delta,
        after: { ...expected, amount: "10" },
      },
    });
    expect(mockAdjustItemQuantity).toHaveBeenCalledWith(
      "user-123",
      "duck eggs",
      "consume",
      expected,
      delta,
    );
  });

  it("returns a structured conflict without another lookup", async () => {
    mockAdjustItemQuantity.mockResolvedValue({
      status: "conflict",
      current: { ...expected, amount: "10" },
    });

    await expect(adjustPantryItemQuantity("user-123", {
      name: "Eggs",
      operation: "consume",
      expectedQuantity: "12 count",
      deltaQuantity: "2 count",
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "conflict",
        name: "Eggs",
        expected,
        current: { ...expected, amount: "10" },
      },
    });
  });

  it("returns unit mismatch before touching the database", async () => {
    await expect(adjustPantryItemQuantity("user-123", {
      name: "Flour",
      operation: "consume",
      expectedQuantity: "2 lb",
      deltaQuantity: "1 oz",
    })).resolves.toMatchObject({
      ok: true,
      value: {
        status: "unit_mismatch",
        expectedUnit: "lb",
        deltaUnit: "oz",
      },
    });
    expect(mockAdjustItemQuantity).not.toHaveBeenCalled();
  });

  it.each([
    [
      {
        name: "Eggs",
        operation: "consume",
        expectedQuantity: "12",
        deltaQuantity: "2 count",
      },
      "expected quantity must include a recognized unit, such as 2 count or 0.5 lb",
    ],
    [
      {
        name: "Eggs",
        operation: "consume",
        expectedQuantity: "12 count",
        deltaQuantity: "2",
      },
      "delta quantity must include a recognized unit, such as 2 count or 0.5 lb",
    ],
    [
      {
        name: "Eggs",
        operation: "consume",
        expectedQuantity: "12 count",
        deltaQuantity: "0 count",
      },
      "delta quantity must be greater than zero",
    ],
    [
      {
        name: "Eggs",
        operation: "set",
        expectedQuantity: "12 count",
        deltaQuantity: "2 count",
      },
      "operation must be consume or restock",
    ],
  ])("rejects an unsafe adjustment input %#", async (input, error) => {
    await expect(
      adjustPantryItemQuantity("user-123", input),
    ).resolves.toEqual({ ok: false, error });
    expect(mockAdjustItemQuantity).not.toHaveBeenCalled();
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
