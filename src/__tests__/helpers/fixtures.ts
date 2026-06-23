import type { Item } from "@/lib/db";

export const fakeItem = (overrides: Partial<Item> = {}): Item => ({
  id: 1,
  name: "eggs",
  quantity: "12",
  created_at: "2024-01-01",
  user_id: "user-123",
  ...overrides,
});

export const fakeMessage = (overrides: Partial<{ role: string; content: string }> = {}) => ({
  role: "user",
  content: "hello",
  ...overrides,
});
