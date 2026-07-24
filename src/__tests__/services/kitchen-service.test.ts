import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeItem } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/db", () => ({
  applyReviewedReceiptImport: vi.fn(),
  adjustItemQuantitiesByCanonicalName: vi.fn(),
  adjustItemQuantityByCanonicalName: vi.fn(),
  addItem: vi.fn(),
  addKitchenTool: vi.fn(),
  deleteItem: vi.fn(),
  deleteItems: vi.fn(),
  deleteKitchenTool: vi.fn(),
  getItemById: vi.fn(),
  getItemByCanonicalName: vi.fn(),
  getItems: vi.fn(),
  getKitchenToolByCanonicalName: vi.fn(),
  getKitchenToolById: vi.fn(),
  getKitchenTools: vi.fn(),
  setItemQuantityByCanonicalName: vi.fn(),
  updateItem: vi.fn(),
  updateKitchenTool: vi.fn(),
}));

import {
  applyReviewedReceiptImport as applyReviewedReceiptImportRecord,
  adjustItemQuantitiesByCanonicalName,
  adjustItemQuantityByCanonicalName,
  addItem,
  addKitchenTool,
  deleteItem,
  deleteItems,
  deleteKitchenTool as deleteKitchenToolRecord,
  getItemById,
  getItemByCanonicalName,
  getItems,
  getKitchenToolByCanonicalName,
  getKitchenToolById,
  getKitchenTools,
  setItemQuantityByCanonicalName,
  updateItem,
  updateKitchenTool as updateKitchenToolRecord,
} from "@/lib/db";
import {
  applyReviewedReceiptImport,
  adjustPantryItemQuantities,
  adjustPantryItemQuantity,
  createKitchenTool,
  createPantryItem,
  deleteKitchenTool,
  deletePantryItem,
  deletePantryItems,
  getKitchenContext,
  listKitchenTools,
  listPantryItems,
  setPantryItemQuantity,
  updateKitchenTool,
  updatePantryItem,
} from "@/lib/kitchen-service";

const mockApplyReviewedReceiptImport = vi.mocked(
  applyReviewedReceiptImportRecord,
);
const mockAdjustItemQuantities = vi.mocked(
  adjustItemQuantitiesByCanonicalName,
);
const mockAdjustItemQuantity = vi.mocked(adjustItemQuantityByCanonicalName);
const mockAddItem = vi.mocked(addItem);
const mockAddKitchenTool = vi.mocked(addKitchenTool);
const mockDeleteItem = vi.mocked(deleteItem);
const mockDeleteItems = vi.mocked(deleteItems);
const mockDeleteKitchenTool = vi.mocked(deleteKitchenToolRecord);
const mockGetItemById = vi.mocked(getItemById);
const mockGetItemByCanonicalName = vi.mocked(getItemByCanonicalName);
const mockGetItems = vi.mocked(getItems);
const mockGetKitchenToolByCanonicalName = vi.mocked(
  getKitchenToolByCanonicalName,
);
const mockGetKitchenToolById = vi.mocked(getKitchenToolById);
const mockGetKitchenTools = vi.mocked(getKitchenTools);
const mockSetItemQuantity = vi.mocked(setItemQuantityByCanonicalName);
const mockUpdateItem = vi.mocked(updateItem);
const mockUpdateKitchenTool = vi.mocked(updateKitchenToolRecord);

const tool = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "user-123",
  name: "Air fryer",
  name_key: "air fryer",
  kind: "appliance" as const,
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
          id: 42,
          name: "Rice",
          quantity: "2 cup",
          turnover: "high",
          quantityMode: "structured",
          quantityAmount: "2.000000",
          quantityUnit: "cup",
        },
        {
          id: 43,
          name: "Milk",
          quantity: "2 cups",
          turnover: "low",
          quantityMode: "text",
          quantityAmount: null,
          quantityUnit: null,
        },
        {
          id: 44,
          name: "Salt",
          quantity: "",
          turnover: "high",
          quantityMode: "unknown",
          quantityAmount: null,
          quantityUnit: null,
        },
        {
          id: 45,
          name: "Protein powder",
          quantity: "4 scoop",
          turnover: "high",
          quantityMode: "unsupported",
          quantityAmount: "4",
          quantityUnit: "scoop",
        },
        {
          id: 46,
          name: "Eggs",
          quantity: "6",
          turnover: "high",
          quantityMode: "structured",
          quantityAmount: "6",
          quantityUnit: "count",
        },
      ],
      tools: [{ id: tool.id, name: "Dutch oven", kind: "cookware" }],
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
    [
      { name: "paprika", quantity: 2 },
      "quantity must be text or an explicit quantity object",
    ],
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
      undefined,
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
      undefined,
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

  it("rejects a stale pantry display name before updating", async () => {
    const current = fakeItem({ id: 42, name: "Chicken stock" });
    mockGetItemById.mockResolvedValue(current);

    await expect(updatePantryItem("user-123", {
      id: 42,
      expectedName: "Chicken broth",
      name: "Chicken consommé",
    })).resolves.toEqual({
      ok: true,
      value: { status: "conflict", id: 42, item: current },
    });
    expect(mockGetItemByCanonicalName).not.toHaveBeenCalled();
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("maps a concurrent pantry rename during update to conflict", async () => {
    const current = fakeItem({ id: 42, name: "Chicken breast" });
    const changed = fakeItem({ id: 42, name: "Chicken stock" });
    mockGetItemById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(changed);
    mockGetItemByCanonicalName.mockResolvedValue(null);
    mockUpdateItem.mockResolvedValue({ status: "not_found" });

    await expect(updatePantryItem("user-123", {
      id: 42,
      expectedName: "Chicken breast",
      name: "Chicken broth",
    })).resolves.toEqual({
      ok: true,
      value: { status: "conflict", id: 42, item: changed },
    });
    expect(mockUpdateItem).toHaveBeenCalledWith(
      "user-123",
      42,
      { name: "Chicken broth" },
      "Chicken breast",
    );
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
    [{ id: 1, quantity: null }, "quantity must be text or an explicit quantity object"],
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
    const item = fakeItem({ id: 7 });
    mockGetItemById.mockResolvedValue(item);
    mockDeleteItem.mockResolvedValue({ status: "deleted" });
    await expect(deletePantryItem("user-123", { id: 7 })).resolves.toEqual({
      ok: true,
      value: { status: "deleted", id: 7 },
    });
    expect(mockDeleteItem).toHaveBeenCalledWith("user-123", 7, undefined);
  });

  it("keeps missing and stale pantry deletions safe", async () => {
    mockGetItemById.mockResolvedValueOnce(null);
    await expect(deletePantryItem("user-123", {
      id: 7,
      expectedName: "Chicken broth",
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", id: 7 },
    });

    const current = fakeItem({ id: 7, name: "Chicken stock" });
    mockGetItemById.mockResolvedValueOnce(current);
    await expect(deletePantryItem("user-123", {
      id: 7,
      expectedName: "Chicken broth",
    })).resolves.toEqual({
      ok: true,
      value: { status: "conflict", id: 7, item: current },
    });
    expect(mockDeleteItem).not.toHaveBeenCalled();
  });

  it("maps a concurrent pantry rename during deletion to conflict", async () => {
    const current = fakeItem({ id: 7, name: "Chicken broth" });
    const changed = fakeItem({ id: 7, name: "Chicken stock" });
    mockGetItemById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(changed);
    mockDeleteItem.mockResolvedValue({ status: "not_found" });

    await expect(deletePantryItem("user-123", {
      id: 7,
      expectedName: "Chicken broth",
    })).resolves.toEqual({
      ok: true,
      value: { status: "conflict", id: 7, item: changed },
    });
    expect(mockDeleteItem).toHaveBeenCalledWith(
      "user-123",
      7,
      "Chicken broth",
    );
  });

  it("validates and delegates atomic pantry batch deletion", async () => {
    await expect(deletePantryItems("user-123", {})).resolves.toEqual({
      ok: false,
      error: "ids must be an array",
    });
    await expect(deletePantryItems("user-123", { ids: [1] })).resolves.toEqual({
      ok: false,
      error: "select at least two pantry items",
    });
    await expect(
      deletePantryItems("user-123", { ids: [1, "2"] }),
    ).resolves.toEqual({
      ok: false,
      error: "every id must be a positive integer",
    });
    await expect(
      deletePantryItems("user-123", { ids: [1, 1] }),
    ).resolves.toEqual({
      ok: false,
      error: "ids must not contain duplicates",
    });
    await expect(
      deletePantryItems("user-123", {
        ids: Array.from({ length: 101 }, (_, index) => index + 1),
      }),
    ).resolves.toEqual({
      ok: false,
      error: "ids must contain 100 items or fewer",
    });

    mockDeleteItems.mockResolvedValue({
      status: "deleted",
      ids: [1, 2],
    });
    await expect(
      deletePantryItems("user-123", { ids: [1, 2] }),
    ).resolves.toEqual({
      ok: true,
      value: { status: "deleted", ids: [1, 2] },
    });
    expect(mockDeleteItems).toHaveBeenCalledWith("user-123", [1, 2]);
  });

  it("sets an explicit structured pantry quantity after normalized name matching", async () => {
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
      quantity: {
        mode: "structured",
        amount: "6",
        unit: "count",
      },
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
        mode: "structured",
        amount: "6",
        unit: "count",
        text: null,
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
      quantity: {
        mode: "structured",
        amount: "6",
        unit: "count",
      },
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
        mode: "structured",
        amount: "6",
        unit: "count",
        text: null,
      },
    );
  });

  it("returns not found if the matched item disappears before the update", async () => {
    mockSetItemQuantity.mockResolvedValue({ status: "not_found" });

    await expect(setPantryItemQuantity("user-123", {
      name: "Eggs",
      quantity: {
        mode: "structured",
        amount: "6",
        unit: "count",
      },
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", name: "Eggs" },
    });
    expect(mockSetItemQuantity).toHaveBeenCalledWith(
      "user-123",
      "Eggs",
      {
        mode: "structured",
        amount: "6",
        unit: "count",
        text: null,
      },
    );
  });

  it("returns not found without writing or creating an item", async () => {
    mockSetItemQuantity.mockResolvedValue({ status: "not_found" });

    await expect(setPantryItemQuantity("user-123", {
      name: "Eggs",
      quantity: {
        mode: "structured",
        amount: "6",
        unit: "count",
      },
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", name: "Eggs" },
    });
    expect(mockSetItemQuantity).toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it.each([
    [{
      quantity: { mode: "structured", amount: "6", unit: "count" },
    }, "name is required"],
    [{ name: "Eggs" }, "quantity is required"],
    [{ name: "Eggs", quantity: "   " }, "quantity is required"],
    [{
      name: "Eggs",
      quantity: { mode: "text", text: "6" },
    }, "quantity must include a recognized unit, such as 2 count or 0.5 lb"],
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

describe("pantry quantity adjustment batches", () => {
  const count12 = {
    mode: "structured" as const,
    amount: "12",
    unit: "count" as const,
    text: null,
  };
  const count2 = {
    mode: "structured" as const,
    amount: "2",
    unit: "count" as const,
    text: null,
  };
  const lb3 = {
    mode: "structured" as const,
    amount: "3",
    unit: "lb" as const,
    text: null,
  };
  const lb1 = {
    mode: "structured" as const,
    amount: "1",
    unit: "lb" as const,
    text: null,
  };

  it("normalizes a bounded batch and returns public before/after results", async () => {
    mockAdjustItemQuantities.mockResolvedValue({
      status: "applied",
      changes: [
        {
          index: 0,
          operation: "consume",
          item: fakeItem({
            name: "Eggs",
            quantity: "10",
            quantity_value: "10",
          }),
          beforeQuantity: "12",
          afterQuantity: "10",
          before: count12,
          delta: count2,
          after: { ...count12, amount: "10" },
        },
        {
          index: 1,
          operation: "restock",
          item: fakeItem({
            id: 2,
            name: "Flour",
            name_key: "flour",
            quantity: "4 lb",
            quantity_value: "4",
            quantity_unit: "lb",
          }),
          beforeQuantity: "3 lb",
          afterQuantity: "4 lb",
          before: lb3,
          delta: lb1,
          after: { ...lb3, amount: "4" },
        },
      ],
    });

    await expect(adjustPantryItemQuantities("user-123", {
      changes: [
        {
          name: " Eggs ",
          operation: "consume",
          expectedQuantity: "12 counts",
          deltaQuantity: "2 count",
        },
        {
          name: "Flour",
          operation: "restock",
          expectedQuantity: "3 lb",
          deltaQuantity: "1 lb",
        },
      ],
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "applied",
        changes: [
          {
            index: 0,
            operation: "consume",
            name: "Eggs",
            beforeQuantity: "12",
            quantity: "10",
            before: count12,
            delta: count2,
            after: { ...count12, amount: "10" },
          },
          {
            index: 1,
            operation: "restock",
            name: "Flour",
            beforeQuantity: "3 lb",
            quantity: "4 lb",
            before: lb3,
            delta: lb1,
            after: { ...lb3, amount: "4" },
          },
        ],
      },
    });
    expect(mockAdjustItemQuantities).toHaveBeenCalledWith("user-123", [
      {
        name: "Eggs",
        operation: "consume",
        expected: count12,
        delta: count2,
      },
      {
        name: "Flour",
        operation: "restock",
        expected: lb3,
        delta: lb1,
      },
    ]);
  });

  it("adds the reviewed expectation to a rejected conflict", async () => {
    mockAdjustItemQuantities.mockResolvedValue({
      status: "rejected",
      failures: [{
        index: 0,
        name: "Eggs",
        status: "conflict",
        current: { ...count12, amount: "10" },
      }],
    });

    await expect(adjustPantryItemQuantities("user-123", {
      changes: [{
        name: "Eggs",
        operation: "consume",
        expectedQuantity: "12 count",
        deltaQuantity: "2 count",
      }],
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "rejected",
        failures: [{
          index: 0,
          name: "Eggs",
          status: "conflict",
          expected: count12,
          current: { ...count12, amount: "10" },
        }],
      },
    });
  });

  it.each([
    [{}, "changes must be an array"],
    [{ changes: [] }, "changes must include at least one item"],
    [
      { changes: Array.from({ length: 26 }, () => ({})) },
      "changes must include 25 items or fewer",
    ],
    [
      { changes: ["Eggs"] },
      "changes[0] must be an object",
    ],
    [
      {
        changes: [{
          name: "Eggs",
          operation: "set",
          expectedQuantity: "12 count",
          deltaQuantity: "2 count",
        }],
      },
      "changes[0].operation must be consume or restock",
    ],
    [
      {
        changes: [{
          name: "Eggs",
          operation: "consume",
          expectedQuantity: "12 count",
          deltaQuantity: "0 count",
        }],
      },
      "changes[0].delta quantity must be greater than zero",
    ],
  ])("rejects an unsafe batch input %#", async (input, error) => {
    await expect(
      adjustPantryItemQuantities("user-123", input),
    ).resolves.toEqual({ ok: false, error });
    expect(mockAdjustItemQuantities).not.toHaveBeenCalled();
  });
});

describe("reviewed receipt imports", () => {
  const requestId = "b9b98fd0-c4b6-4de7-8a9d-1d05be0d6ac1";

  it("normalizes explicit create/restock decisions and delegates once", async () => {
    mockApplyReviewedReceiptImport.mockResolvedValue({
      status: "applied",
      requestId,
      replayed: false,
      changes: [],
    });

    await expect(applyReviewedReceiptImport("user-123", {
      requestId: requestId.toUpperCase(),
      lines: [
        {
          decision: "create",
          name: "  Black beans ",
          quantity: "2 cans",
        },
        {
          decision: "restock",
          name: " Rice ",
          expectedQuantity: "2 cups",
          deltaQuantity: "1 cup",
        },
      ],
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "applied",
        requestId,
        replayed: false,
        changes: [],
      },
    });
    expect(mockApplyReviewedReceiptImport).toHaveBeenCalledTimes(1);
    expect(mockApplyReviewedReceiptImport).toHaveBeenCalledWith(
      "user-123",
      requestId,
      [
        {
          decision: "create",
          name: "Black beans",
          quantity: {
            mode: "structured",
            amount: "2",
            unit: "can",
            text: null,
          },
          turnover: "high",
        },
        {
          decision: "restock",
          name: "Rice",
          expected: {
            mode: "structured",
            amount: "2",
            unit: "cup",
            text: null,
          },
          delta: {
            mode: "structured",
            amount: "1",
            unit: "cup",
            text: null,
          },
        },
      ],
    );
  });

  it.each([
    [{}, "requestId must be a UUID"],
    [{ requestId }, "lines must be an array"],
    [{ requestId, lines: [] }, "lines must include at least one item"],
    [
      { requestId, lines: Array.from({ length: 26 }, () => ({})) },
      "lines must include 25 items or fewer",
    ],
    [
      { requestId, lines: ["Eggs"] },
      "lines[0] must be an object",
    ],
    [
      { requestId, lines: [{ decision: "merge", name: "Eggs" }] },
      "lines[0].decision must be create or restock",
    ],
    [
      {
        requestId,
        lines: [{ decision: "create", name: "Eggs", quantity: "12" }],
      },
      "lines[0].quantity must include a recognized unit, such as 2 count or 0.5 lb",
    ],
    [
      {
        requestId,
        lines: [{ decision: "create", name: "Eggs", quantity: "0 count" }],
      },
      "lines[0].quantity must be greater than zero",
    ],
    [
      {
        requestId,
        lines: [{
          decision: "restock",
          name: "Eggs",
          expectedQuantity: "12 count",
          deltaQuantity: "0 count",
        }],
      },
      "lines[0].delta quantity must be greater than zero",
    ],
  ])("rejects invalid reviewed receipt input %#", async (input, error) => {
    await expect(
      applyReviewedReceiptImport("user-123", input),
    ).resolves.toEqual({ ok: false, error });
    expect(mockApplyReviewedReceiptImport).not.toHaveBeenCalled();
  });
});

describe("kitchen-tool commands", () => {
  it("normalizes creation input and delegates as the user", async () => {
    mockAddKitchenTool.mockResolvedValue({ status: "created", tool });

    await expect(createKitchenTool("user-123", {
      name: " Air fryer ",
      kind: " appliance ",
    })).resolves.toEqual({
      ok: true,
      value: { status: "created", tool },
    });
    expect(mockAddKitchenTool).toHaveBeenCalledWith(
      "user-123",
      "Air fryer",
      "appliance",
    );
  });

  it("returns an existing canonical duplicate without creating another tool", async () => {
    mockAddKitchenTool.mockResolvedValue({
      status: "already_exists",
      tool,
    });

    await expect(createKitchenTool("user-123", {
      name: "  AIR   FRYER  ",
      kind: " APPLIANCE ",
    })).resolves.toEqual({
      ok: true,
      value: { status: "already_exists", tool },
    });
    expect(mockAddKitchenTool).toHaveBeenCalledWith(
      "user-123",
      "AIR   FRYER",
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
      { name: "Air fryer", kind: "countertop" },
      "kind must be appliance, cookware, or bakeware",
    ],
  ])("rejects invalid tool creation input %#", async (input, error) => {
    await expect(createKitchenTool("user-123", input)).resolves.toEqual({
      ok: false,
      error,
    });
    expect(mockAddKitchenTool).not.toHaveBeenCalled();
  });

  it("normalizes and delegates tool updates as the user", async () => {
    const updated = {
      ...tool,
      name: "Convection oven",
      name_key: "convection oven",
    };
    mockGetKitchenToolById.mockResolvedValue(tool);
    mockGetKitchenToolByCanonicalName.mockResolvedValue(null);
    mockUpdateKitchenTool.mockResolvedValue({ status: "updated", tool: updated });

    await expect(updateKitchenTool("user-123", {
      id: tool.id,
      name: " Convection oven ",
      kind: " appliance ",
    })).resolves.toEqual({
      ok: true,
      value: { status: "updated", tool: updated },
    });
    expect(mockUpdateKitchenTool).toHaveBeenCalledWith(
      "user-123",
      tool.id,
      "Convection oven",
      "appliance",
      undefined,
    );
  });

  it("returns unchanged without writing an equivalent edit", async () => {
    mockGetKitchenToolById.mockResolvedValue(tool);
    mockGetKitchenToolByCanonicalName.mockResolvedValue(tool);

    await expect(updateKitchenTool("user-123", {
      id: tool.id.toUpperCase(),
      name: "  AIR   FRYER  ",
      kind: " APPLIANCE ",
    })).resolves.toEqual({
      ok: true,
      value: { status: "unchanged", tool },
    });
    expect(mockUpdateKitchenTool).not.toHaveBeenCalled();
  });

  it("preserves the display name when only kind changes canonically", async () => {
    mockGetKitchenToolById.mockResolvedValue(tool);
    mockGetKitchenToolByCanonicalName.mockResolvedValue(tool);
    const updated = { ...tool, kind: "cookware" as const };
    mockUpdateKitchenTool.mockResolvedValue({ status: "updated", tool: updated });

    await expect(updateKitchenTool("user-123", {
      id: tool.id,
      name: "  AIR   FRYER  ",
      kind: "cookware",
    })).resolves.toEqual({
      ok: true,
      value: { status: "updated", tool: updated },
    });
    expect(mockUpdateKitchenTool).toHaveBeenCalledWith(
      "user-123",
      tool.id,
      "Air fryer",
      "cookware",
      undefined,
    );
  });

  it("treats Unicode-composition variants as the same unchanged identity", async () => {
    const unicodeTool = {
      ...tool,
      name: "Café press",
      name_key: "café press",
    };
    mockGetKitchenToolById.mockResolvedValue(unicodeTool);
    mockGetKitchenToolByCanonicalName.mockResolvedValue(unicodeTool);

    await expect(updateKitchenTool("user-123", {
      id: tool.id,
      name: "CAFE\u0301   PRESS",
      kind: "appliance",
    })).resolves.toEqual({
      ok: true,
      value: { status: "unchanged", tool: unicodeTool },
    });
    expect(mockUpdateKitchenTool).not.toHaveBeenCalled();
  });

  it("keeps missing and foreign tool IDs indistinguishable", async () => {
    mockGetKitchenToolById.mockResolvedValue(null);

    await expect(updateKitchenTool("user-123", {
      id: tool.id,
      name: "Air fryer",
      kind: "appliance",
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", id: tool.id },
    });
    expect(mockGetKitchenToolByCanonicalName).not.toHaveBeenCalled();
    expect(mockUpdateKitchenTool).not.toHaveBeenCalled();
  });

  it("rejects a stale kitchen-tool display name before updating", async () => {
    mockGetKitchenToolById.mockResolvedValue(tool);

    await expect(updateKitchenTool("user-123", {
      id: tool.id,
      expectedName: "Countertop oven",
      name: "Convection oven",
      kind: "appliance",
    })).resolves.toEqual({
      ok: true,
      value: { status: "conflict", id: tool.id, tool },
    });
    expect(mockGetKitchenToolByCanonicalName).not.toHaveBeenCalled();
    expect(mockUpdateKitchenTool).not.toHaveBeenCalled();
  });

  it("maps a concurrent kitchen-tool rename during update to conflict", async () => {
    const changed = { ...tool, name: "Countertop oven" };
    mockGetKitchenToolById
      .mockResolvedValueOnce(tool)
      .mockResolvedValueOnce(changed);
    mockGetKitchenToolByCanonicalName.mockResolvedValue(null);
    mockUpdateKitchenTool.mockResolvedValue({ status: "not_found" });

    await expect(updateKitchenTool("user-123", {
      id: tool.id,
      expectedName: "Air fryer",
      name: "Convection oven",
      kind: "appliance",
    })).resolves.toEqual({
      ok: true,
      value: { status: "conflict", id: tool.id, tool: changed },
    });
    expect(mockUpdateKitchenTool).toHaveBeenCalledWith(
      "user-123",
      tool.id,
      "Convection oven",
      "appliance",
      "Air fryer",
    );
  });

  it("returns canonical conflicts without exposing another user's rows", async () => {
    const conflictingTool = {
      ...tool,
      id: "00000000-0000-0000-0000-000000000002",
      name: "Dutch oven",
      name_key: "dutch oven",
      kind: "cookware" as const,
    };
    mockGetKitchenToolById.mockResolvedValue(tool);
    mockGetKitchenToolByCanonicalName.mockResolvedValue(conflictingTool);

    await expect(updateKitchenTool("user-123", {
      id: tool.id,
      name: " DUTCH   OVEN ",
      kind: "cookware",
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "name_conflict",
        id: tool.id,
        conflictingTool,
      },
    });
    expect(mockUpdateKitchenTool).not.toHaveBeenCalled();
  });

  it("maps a database race conflict after the preflight check", async () => {
    const conflictingTool = {
      ...tool,
      id: "00000000-0000-0000-0000-000000000002",
      name: "Dutch oven",
      name_key: "dutch oven",
      kind: "cookware" as const,
    };
    mockGetKitchenToolById.mockResolvedValue(tool);
    mockGetKitchenToolByCanonicalName
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(conflictingTool);
    mockUpdateKitchenTool.mockResolvedValue({ status: "name_conflict" });

    await expect(updateKitchenTool("user-123", {
      id: tool.id,
      name: "Dutch oven",
      kind: "cookware",
    })).resolves.toEqual({
      ok: true,
      value: {
        status: "name_conflict",
        id: tool.id,
        conflictingTool,
      },
    });
  });

  it("validates then delegates tool deletion as the user", async () => {
    await expect(deleteKitchenTool("user-123", {})).resolves.toEqual({
      ok: false,
      error: "id must be a UUID",
    });
    mockGetKitchenToolById.mockResolvedValue(tool);
    mockDeleteKitchenTool.mockResolvedValue({ status: "deleted" });
    await expect(deleteKitchenTool("user-123", {
      id: tool.id,
    })).resolves.toEqual({
      ok: true,
      value: { status: "deleted", id: tool.id },
    });
    expect(mockDeleteKitchenTool).toHaveBeenCalledWith(
      "user-123",
      tool.id,
      undefined,
    );
  });

  it("truthfully reports a missing tool deletion", async () => {
    mockDeleteKitchenTool.mockResolvedValue({ status: "not_found" });

    await expect(deleteKitchenTool("user-123", {
      id: tool.id,
    })).resolves.toEqual({
      ok: true,
      value: { status: "not_found", id: tool.id },
    });
  });

  it("rejects a stale kitchen-tool display name before deletion", async () => {
    mockGetKitchenToolById.mockResolvedValue(tool);

    await expect(deleteKitchenTool("user-123", {
      id: tool.id,
      expectedName: "Countertop oven",
    })).resolves.toEqual({
      ok: true,
      value: { status: "conflict", id: tool.id, tool },
    });
    expect(mockDeleteKitchenTool).not.toHaveBeenCalled();
  });

  it("maps a concurrent kitchen-tool rename during deletion to conflict", async () => {
    const changed = { ...tool, name: "Countertop oven" };
    mockGetKitchenToolById
      .mockResolvedValueOnce(tool)
      .mockResolvedValueOnce(changed);
    mockDeleteKitchenTool.mockResolvedValue({ status: "not_found" });

    await expect(deleteKitchenTool("user-123", {
      id: tool.id,
      expectedName: "Air fryer",
    })).resolves.toEqual({
      ok: true,
      value: { status: "conflict", id: tool.id, tool: changed },
    });
    expect(mockDeleteKitchenTool).toHaveBeenCalledWith(
      "user-123",
      tool.id,
      "Air fryer",
    );
  });
});
