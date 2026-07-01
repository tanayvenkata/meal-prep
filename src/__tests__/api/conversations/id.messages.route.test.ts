import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/conversations/[id]/messages/route";
import { fakeConversation, fakeDbMessage } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getConversation: vi.fn(),
  addMessage: vi.fn(),
}));

import { getUserId } from "@/lib/auth";
import { getConversation, addMessage } from "@/lib/db";

const mockGetUserId = vi.mocked(getUserId);
const mockGetConversation = vi.mocked(getConversation);
const mockAddMessage = vi.mocked(addMessage);

const fakeParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/conversations/[id]/messages", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUserId.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/conversations/abc/messages", {
        method: "POST",
        body: JSON.stringify({ role: "user", content: "hello" }),
      }),
      fakeParams("abc")
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });

  it("returns 400 when role is missing", async () => {
    mockGetUserId.mockResolvedValue("user-123");

    const response = await POST(
      new Request("http://localhost/api/conversations/abc/messages", {
        method: "POST",
        body: JSON.stringify({ content: "hello" }),
      }),
      fakeParams("abc")
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("role and content are required");
  });

  it("returns 400 when content is missing", async () => {
    mockGetUserId.mockResolvedValue("user-123");

    const response = await POST(
      new Request("http://localhost/api/conversations/abc/messages", {
        method: "POST",
        body: JSON.stringify({ role: "user" }),
      }),
      fakeParams("abc")
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("role and content are required");
  });

  it("returns 400 when role is not user or assistant", async () => {
    mockGetUserId.mockResolvedValue("user-123");

    const response = await POST(
      new Request("http://localhost/api/conversations/abc/messages", {
        method: "POST",
        body: JSON.stringify({ role: "system", content: "hello" }),
      }),
      fakeParams("abc")
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("role must be user or assistant");
  });

  it("returns 404 when conversation does not belong to this user", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockGetConversation.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/conversations/abc/messages", {
        method: "POST",
        body: JSON.stringify({ role: "user", content: "hello" }),
      }),
      fakeParams("abc")
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("not found");
  });

  it("returns 201 with the saved message", async () => {
    mockGetUserId.mockResolvedValue("user-123");
    mockGetConversation.mockResolvedValue(fakeConversation());
    mockAddMessage.mockResolvedValue(fakeDbMessage({ role: "user", content: "hello" }));

    const response = await POST(
      new Request("http://localhost/api/conversations/abc/messages", {
        method: "POST",
        body: JSON.stringify({ role: "user", content: "hello" }),
      }),
      fakeParams("abc")
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.role).toBe("user");
    expect(body.content).toBe("hello");
    expect(body.id).toBeDefined();
  });
});
