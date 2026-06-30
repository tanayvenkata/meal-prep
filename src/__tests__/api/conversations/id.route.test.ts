import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/conversations/[id]/route";
import { fakeConversation, fakeDbMessage } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getConversation: vi.fn(),
  getMessages: vi.fn(),
}));

import { getUserId } from "@/lib/auth";
import { getConversation, getMessages } from "@/lib/db";

const mockGetUserId = vi.mocked(getUserId);
const mockGetConversation = vi.mocked(getConversation);
const mockGetMessages = vi.mocked(getMessages);

const fakeParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/conversations/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUserId.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/conversations/abc"),
      fakeParams("abc")
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });

  it("returns 404 when conversation does not exist", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockGetConversation.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/conversations/abc"),
      fakeParams("abc")
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("not found");
  });

  it("returns 404 when conversation belongs to another user", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockGetConversation.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/conversations/abc"),
      fakeParams("abc")
    );

    expect(response.status).toBe(404);
  });

  it("returns 200 with conversation and messages", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockGetConversation.mockResolvedValue(fakeConversation());
    mockGetMessages.mockResolvedValue([fakeDbMessage()]);

    const response = await GET(
      new Request("http://localhost/api/conversations/00000000-0000-0000-0000-000000000001"),
      fakeParams("00000000-0000-0000-0000-000000000001")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversation.title).toBe("what can I make with eggs");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
  });
});
