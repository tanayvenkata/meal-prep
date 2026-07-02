import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, PUT, DELETE } from "@/app/api/pantry/route";
import { fakeItem } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getItems: vi.fn(),
  addItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
}));

import { getUserId } from "@/lib/auth";
import { getItems, addItem, updateItem, deleteItem } from "@/lib/db";

const mockGetUserId = vi.mocked(getUserId);
const mockGetItems = vi.mocked(getItems);
const mockAddItem = vi.mocked(addItem);
const mockUpdateItem = vi.mocked(updateItem);
const mockDeleteItem = vi.mocked(deleteItem);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/pantry", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUserId.mockResolvedValue(null);

    const request = new Request("http://localhost/api/pantry");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 200 with items for authenticated user", async () => {
    mockGetUserId.mockResolvedValue("user-123");
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
    mockGetUserId.mockResolvedValue(null);

    const request = new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "eggs" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 400 when name is missing", async () => {
    mockGetUserId.mockResolvedValue("user-123");

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
    mockGetUserId.mockResolvedValue("user-123");

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
    mockGetUserId.mockResolvedValue("user-123");

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
    mockGetUserId.mockResolvedValue("user-123");

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
    mockGetUserId.mockResolvedValue("user-123");
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
});

describe("PUT /api/pantry", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUserId.mockResolvedValue(null);

    const request = new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, quantity: "6" }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 400 when id is missing", async () => {
    mockGetUserId.mockResolvedValue("user-123");

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
    mockGetUserId.mockResolvedValue("user-123");

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
    mockGetUserId.mockResolvedValue("user-123");

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
    mockGetUserId.mockResolvedValue("user-123");
    mockUpdateItem.mockResolvedValue(fakeItem({ quantity: "6" }));

    const request = new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, quantity: "6" }),
    });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mockUpdateItem).toHaveBeenCalledWith("user-123", 1, "6", undefined);
  });

  it("returns 200 with the updated item", async () => {
    mockGetUserId.mockResolvedValue("user-123");
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
    mockGetUserId.mockResolvedValue(null);

    const request = new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({ id: 1 }),
    });
    const response = await DELETE(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 400 when id is missing", async () => {
    mockGetUserId.mockResolvedValue("user-123");

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
    mockGetUserId.mockResolvedValue("user-123");
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
