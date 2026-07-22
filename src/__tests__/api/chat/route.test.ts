import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/chat/route";
import { fakeItem, fakeKitchenTool, fakeMessage } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getItems: vi.fn(),
  getKitchenTools: vi.fn(),
  createConversation: vi.fn(),
  addMessage: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  streamChat: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: vi.fn(),
}));

import { getUserId } from "@/lib/auth";
import { getItems, getKitchenTools, createConversation, addMessage } from "@/lib/db";
import { streamChat } from "@/lib/ai";
import { checkRateLimit } from "@/lib/ratelimit";

const mockGetUserId = vi.mocked(getUserId);
const mockGetItems = vi.mocked(getItems);
const mockGetKitchenTools = vi.mocked(getKitchenTools);
const mockStreamChat = vi.mocked(streamChat);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockCreateConversation = vi.mocked(createConversation);
const mockAddMessage = vi.mocked(addMessage);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetItems.mockResolvedValue([]);
  mockGetKitchenTools.mockResolvedValue([]);
  mockCheckRateLimit.mockResolvedValue(true);
});

describe("POST /api/chat", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUserId.mockResolvedValue(null);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [fakeMessage({ content: "what can I make?" })] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockCheckRateLimit.mockResolvedValue(false);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [fakeMessage({ content: "what can I make?" })] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("too many requests");
  });

  it("returns 400 when messages are missing", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockCheckRateLimit.mockResolvedValue(true);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId: "abc" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("messages are required");
  });

  it("returns 400 when messages array is empty", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockCheckRateLimit.mockResolvedValue(true);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("messages are required");
  });

  it("returns 400 when conversationId is missing", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockCheckRateLimit.mockResolvedValue(true);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [fakeMessage()] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("conversationId is required");
  });

  it("creates a conversation on the first message using the message as title", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockCheckRateLimit.mockResolvedValue(true);
    mockGetItems.mockResolvedValue([]);
    mockCreateConversation.mockResolvedValue({ id: "conv-1", user_id: "user-123", title: "what can I make?", created_at: "" });
    mockAddMessage.mockResolvedValue({ id: "msg-1", conversation_id: "conv-1", role: "user", content: "what can I make?", created_at: "" });
    mockStreamChat.mockReturnValue((async function* () { yield "omelette!"; })());

    const msg = fakeMessage({ content: "what can I make?" });
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId: "conv-1", messages: [msg] }),
    });
    await POST(request);

    expect(mockCreateConversation).toHaveBeenCalledWith("user-123", "what can I make?", "conv-1");
  });

  it("truncates long first messages to 50 chars for the title", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockCheckRateLimit.mockResolvedValue(true);
    mockGetItems.mockResolvedValue([]);
    mockCreateConversation.mockResolvedValue({ id: "conv-1", user_id: "user-123", title: "", created_at: "" });
    mockAddMessage.mockResolvedValue({ id: "msg-1", conversation_id: "conv-1", role: "user", content: "", created_at: "" });
    mockStreamChat.mockReturnValue((async function* () { yield "sure!"; })());

    const longMessage = "a".repeat(80);
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId: "conv-1", messages: [fakeMessage({ content: longMessage })] }),
    });
    await POST(request);

    const [, title] = mockCreateConversation.mock.calls[0];
    expect(title.length).toBe(50);
  });

  it("saves the user message before streaming", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockCheckRateLimit.mockResolvedValue(true);
    mockGetItems.mockResolvedValue([]);
    mockCreateConversation.mockResolvedValue({ id: "conv-1", user_id: "user-123", title: "hello", created_at: "" });
    mockAddMessage.mockResolvedValue({ id: "msg-1", conversation_id: "conv-1", role: "user", content: "hello", created_at: "" });
    mockStreamChat.mockReturnValue((async function* () { yield "hi!"; })());

    const msg = fakeMessage({ content: "hello" });
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId: "conv-1", messages: [msg] }),
    });
    await POST(request);

    expect(mockAddMessage).toHaveBeenCalledWith("user-123", "conv-1", "user", "hello");
  });

  it("returns a stream and calls streamChat with kitchen context in instructions", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockCheckRateLimit.mockResolvedValue(true);
    mockGetItems.mockResolvedValue([
      fakeItem({ name: "eggs" }),
      fakeItem({ id: 2, name: "milk", quantity: "1L" }),
    ]);
    mockGetKitchenTools.mockResolvedValue([fakeKitchenTool({ name: "Air fryer", kind: "appliance" })]);
    mockCreateConversation.mockResolvedValue({ id: "conv-1", user_id: "user-123", title: "what can I make?", created_at: "" });
    mockAddMessage.mockResolvedValue({ id: "msg-1", conversation_id: "conv-1", role: "user", content: "what can I make?", created_at: "" });
    mockStreamChat.mockReturnValue(
      (async function* () { yield "Try an omelette!"; })()
    );

    const msg = fakeMessage({ content: "what can I make?" });
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId: "conv-1", messages: [msg] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const [calledMessages, calledSystem] = mockStreamChat.mock.calls[0];
    expect(calledMessages).toEqual([msg]);
    expect(calledSystem).toContain("eggs");
    expect(calledSystem).toContain("milk");
    expect(calledSystem).toContain("12");
    expect(calledSystem).toContain("turnover: high");
    expect(calledSystem).toContain("Air fryer");
    expect(calledSystem).toContain("kind: appliance");
  });
});
