import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, DELETE } from "@/app/api/conversations/[id]/route";
import { fakeConversation, fakeDbMessage } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getConversation: vi.fn(),
  getMessages: vi.fn(),
  deleteConversation: vi.fn(),
}));

import { getUserId } from "@/lib/auth";
import { getConversation, getMessages, deleteConversation } from "@/lib/db";

const mockGetUserId = vi.mocked(getUserId);
const mockGetConversation = vi.mocked(getConversation);
const mockGetMessages = vi.mocked(getMessages);
const mockDeleteConversation = vi.mocked(deleteConversation);

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

describe("DELETE /api/conversations/[id]", () => {
  const del = (id: string) =>
    DELETE(
      new Request(`http://localhost/api/conversations/${id}`, { method: "DELETE" }),
      fakeParams(id)
    );

  it("returns 401 when not authenticated", async () => {
    mockGetUserId.mockResolvedValue(null);

    const response = await del("abc");

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
    expect(mockDeleteConversation).not.toHaveBeenCalled();
  });

  it("scopes the delete to the authenticated user", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockDeleteConversation.mockResolvedValue();

    const response = await del("conv-abc");

    expect(response.status).toBe(204);
    expect(mockDeleteConversation).toHaveBeenCalledWith("user-123", "conv-abc");
  });

  it("returns 204 on success", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockDeleteConversation.mockResolvedValue();

    const response = await del("conv-abc");

    expect(response.status).toBe(204);
  });

  it("returns 500 when the delete fails", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockDeleteConversation.mockRejectedValue(new Error("db down"));

    const response = await del("conv-abc");

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("failed to delete conversation");
  });
});
