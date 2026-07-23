import type { Item, KitchenTool, Conversation, Message } from "@/lib/db";

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

export const fakeMessage = (overrides: Partial<{ role: string; content: string }> = {}) => ({
  role: "user",
  content: "hello",
  ...overrides,
});

export const fakeKitchenTool = (overrides: Partial<KitchenTool> = {}): KitchenTool => ({
  id: "00000000-0000-0000-0000-000000000003",
  user_id: "user-123",
  name: "Frying pan",
  kind: "cookware",
  created_at: "2024-01-01",
  ...overrides,
});

export const fakeConversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "user-123",
  title: "what can I make with eggs",
  created_at: "2024-01-01",
  ...overrides,
});

export const fakeDbMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "00000000-0000-0000-0000-000000000002",
  conversation_id: "00000000-0000-0000-0000-000000000001",
  role: "user",
  content: "what can I make with eggs?",
  created_at: "2024-01-01",
  ...overrides,
});
