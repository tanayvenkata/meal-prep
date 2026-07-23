import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/conversations/route";
import { fakeConversation } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getRequestAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
}));

import { getRequestAuth } from "@/lib/auth";
import { listConversations, createConversation } from "@/lib/db";

const mockGetRequestAuth = vi.mocked(getRequestAuth);
const mockListConversations = vi.mocked(listConversations);
const mockCreateConversation = vi.mocked(createConversation);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/conversations", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetRequestAuth.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/conversations"));

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });

  it("returns 403 for an OAuth client token", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });

    const response = await GET(new Request("http://localhost/api/conversations"));

    expect(response.status).toBe(403);
    expect(mockListConversations).not.toHaveBeenCalled();
  });

  it("returns 200 with conversations for authenticated user", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockListConversations.mockResolvedValue([fakeConversation()]);

    const response = await GET(new Request("http://localhost/api/conversations"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("what can I make with eggs");
  });
});

describe("POST /api/conversations", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetRequestAuth.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "eggs chat" }),
    }));

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });

  it("returns 403 for an OAuth client token", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });

    const response = await POST(new Request("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "private chat" }),
    }));

    expect(response.status).toBe(403);
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it("returns 400 when title is missing", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const response = await POST(new Request("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("title is required");
  });

  it("returns 400 when title is blank", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const response = await POST(new Request("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "   " }),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("title is required");
  });

  it("returns 201 with the new conversation", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockCreateConversation.mockResolvedValue(fakeConversation());

    const response = await POST(new Request("http://localhost/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title: "what can I make with eggs" }),
    }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.title).toBe("what can I make with eggs");
    expect(body.id).toBeDefined();
  });
});
