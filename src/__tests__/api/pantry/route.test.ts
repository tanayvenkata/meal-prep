import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, PUT, DELETE } from "@/app/api/pantry/route";
import { fakeItem } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getRequestAuth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getItems: vi.fn(),
  addItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
}));

import { getRequestAuth } from "@/lib/auth";
import { getItems, addItem, updateItem, deleteItem } from "@/lib/db";

const mockGetRequestAuth = vi.mocked(getRequestAuth);
const mockGetItems = vi.mocked(getItems);
const mockAddItem = vi.mocked(addItem);
const mockUpdateItem = vi.mocked(updateItem);
const mockDeleteItem = vi.mocked(deleteItem);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/pantry", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetRequestAuth.mockResolvedValue(null);

    const request = new Request("http://localhost/api/pantry");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 200 with items for authenticated user", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockGetItems.mockResolvedValue([fakeItem()]);

    const request = new Request("http://localhost/api/pantry");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([fakeItem()]);
  });
});

describe("POST /api/pantry", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetRequestAuth.mockResolvedValue(null);

    const request = new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "eggs" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 403 for an OAuth client token", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });

    const response = await POST(new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "eggs", quantity: "12" }),
    }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("oauth client is read-only");
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const request = new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("name is required");
  });

  it("returns 400 when name is empty string", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const request = new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "   " }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("name is required");
  });

  it("returns 400 when name is not a string", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const request = new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: 42 }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("name is required");
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const request = new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "a".repeat(101) }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("name must be 100 characters or fewer");
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it("returns 201 with the new item", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockAddItem.mockResolvedValue(fakeItem());

    const request = new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "eggs", quantity: "12" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.name).toBe("eggs");
    expect(body.quantity).toBe("12");
  });

  it("accepts a low-turnover item", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockAddItem.mockResolvedValue(fakeItem({ turnover: "low" }));

    const request = new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "paprika", quantity: "1 jar", turnover: "low" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mockAddItem).toHaveBeenCalledWith("user-123", "paprika", "1 jar", "low");
  });

  it("rejects an unknown turnover value", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const request = new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "paprika", turnover: "medium" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("turnover must be high or low");
    expect(mockAddItem).not.toHaveBeenCalled();
  });
});

describe("PUT /api/pantry", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetRequestAuth.mockResolvedValue(null);

    const request = new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, quantity: "6" }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 403 for an OAuth client token", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });

    const response = await PUT(new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, quantity: "6" }),
    }));

    expect(response.status).toBe(403);
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("returns 400 when id is missing", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const request = new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ quantity: "6" }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("id is required");
  });

  it("returns 400 when name is provided but whitespace-only", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const request = new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, name: "   " }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("name is required");
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const request = new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, name: "a".repeat(101) }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("name must be 100 characters or fewer");
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("returns 200 when name is omitted (quantity-only update)", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockUpdateItem.mockResolvedValue(fakeItem({ quantity: "6" }));

    const request = new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, quantity: "6" }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mockUpdateItem).toHaveBeenCalledWith("user-123", 1, "6", undefined, undefined);
  });

  it("updates turnover when provided", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockUpdateItem.mockResolvedValue(fakeItem({ turnover: "low" }));

    const request = new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, quantity: "1 jar", turnover: "low" }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mockUpdateItem).toHaveBeenCalledWith("user-123", 1, "1 jar", undefined, "low");
  });

  it("returns 200 with the updated item", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockUpdateItem.mockResolvedValue(fakeItem({ quantity: "6" }));

    const request = new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, quantity: "6" }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(1);
    expect(body.quantity).toBe("6");
  });
});

describe("DELETE /api/pantry", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetRequestAuth.mockResolvedValue(null);

    const request = new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({ id: 1 }),
    });
    const response = await DELETE(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 403 for an OAuth client token", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });

    const response = await DELETE(new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({ id: 1 }),
    }));

    expect(response.status).toBe(403);
    expect(mockDeleteItem).not.toHaveBeenCalled();
  });

  it("returns 400 when id is missing", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });

    const request = new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({}),
    });
    const response = await DELETE(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("id is required");
  });

  it("returns 200 with success on deletion", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockDeleteItem.mockResolvedValue();

    const request = new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({ id: 1 }),
    });
    const response = await DELETE(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
