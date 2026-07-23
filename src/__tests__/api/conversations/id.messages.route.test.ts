import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/conversations/[id]/messages/route";
import { fakeConversation, fakeDbMessage } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getRequestAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getConversation: vi.fn(),
  addMessage: vi.fn(),
}));

import { getRequestAuth } from "@/lib/auth";
import { getConversation, addMessage } from "@/lib/db";

const mockGetRequestAuth = vi.mocked(getRequestAuth);
const mockGetConversation = vi.mocked(getConversation);
const mockAddMessage = vi.mocked(addMessage);

const fakeParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/conversations/[id]/messages", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetRequestAuth.mockResolvedValue(null);

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

  it("returns 403 for an OAuth client token", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });

    const response = await POST(
      new Request("http://localhost/api/conversations/abc/messages", {
        method: "POST",
        body: JSON.stringify({ role: "user", content: "hello" }),
      }),
      fakeParams("abc"),
    );

    expect(response.status).toBe(403);
    expect(mockGetConversation).not.toHaveBeenCalled();
    expect(mockAddMessage).not.toHaveBeenCalled();
  });

  it("returns 400 when role is missing", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

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
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

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
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

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
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
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
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
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
