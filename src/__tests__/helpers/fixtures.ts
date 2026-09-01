import type { Item, KitchenTool } from "@/lib/db";

export const fakeItem = (overrides: Partial<Item> = {}): Item => ({
  id: 1,
  name: "eggs",
  name_key: "eggs",
  quantity: "12",
  quantity_text: "",
  quantity_value: "12",
  quantity_unit: "count",
  turnover: "high",
  created_at: "2024-01-01",
  user_id: "user-123",
  ...overrides,
});

export const fakeKitchenTool = (overrides: Partial<KitchenTool> = {}): KitchenTool => ({
  id: "00000000-0000-0000-0000-000000000003",
  user_id: "user-123",
  name: "Frying pan",
  name_key: "frying pan",
  kind: "cookware",
  created_at: "2024-01-01",
  ...overrides,
});
