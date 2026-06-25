import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/recipes/route";
import { fakeItem, fakeMessage } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getItems: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  streamChat: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: vi.fn(),
}));

import { getUserId } from "@/lib/auth";
import { getItems } from "@/lib/db";
import { streamChat } from "@/lib/ai";
import { checkRateLimit } from "@/lib/ratelimit";

const mockGetUserId = vi.mocked(getUserId);
const mockGetItems = vi.mocked(getItems);
const mockStreamChat = vi.mocked(streamChat);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/recipes", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUserId.mockResolvedValue(null);

    const request = new Request("http://localhost/api/recipes", {
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

    const request = new Request("http://localhost/api/recipes", {
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

    const request = new Request("http://localhost/api/recipes", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("messages are required");
  });

  it("returns 400 when messages array is empty", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockCheckRateLimit.mockResolvedValue(true);

    const request = new Request("http://localhost/api/recipes", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("messages are required");
  });

  it("returns a stream and calls streamChat with pantry in system prompt", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockCheckRateLimit.mockResolvedValue(true);
    mockGetItems.mockResolvedValue([
      fakeItem({ name: "eggs" }),
      fakeItem({ id: 2, name: "milk", quantity: "1L" }),
    ]);
    mockStreamChat.mockReturnValue(
      (async function* () { yield "Try an omelette!"; })()
    );

    const msg = fakeMessage({ content: "what can I make?" });
    const request = new Request("http://localhost/api/recipes", {
      method: "POST",
      body: JSON.stringify({ messages: [msg] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);

    const [calledMessages, calledSystem] = mockStreamChat.mock.calls[0];
    expect(calledMessages).toEqual([msg]);
    expect(calledSystem).toContain("eggs");
    expect(calledSystem).toContain("milk");
  });
});
