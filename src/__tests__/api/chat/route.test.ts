import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/chat/route";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  streamChat: vi.fn(),
}));

import { getUserId } from "@/lib/auth";
import { streamChat } from "@/lib/ai";

const mockGetUserId = vi.mocked(getUserId);
const mockStreamChat = vi.mocked(streamChat);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/chat", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUserId.mockResolvedValue(null);

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns 400 when messages are missing", async () => {
    mockGetUserId.mockResolvedValue("user-123");

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when messages array is empty", async () => {
    mockGetUserId.mockResolvedValue("user-123");

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns a stream for authenticated user with valid messages", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockStreamChat.mockReturnValue(
      (async function* () { yield "Hello"; })()
    );

    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockStreamChat).toHaveBeenCalledWith(
      [{ role: "user", content: "hello" }]
    );
  });
});
