import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST, PUT } from "@/app/api/pantry/route";
import { fakeItem } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getRequestAuth: vi.fn(),
}));
vi.mock("@/lib/kitchen-service", () => ({
  createPantryItem: vi.fn(),
  deletePantryItem: vi.fn(),
  listPantryItems: vi.fn(),
  updatePantryItem: vi.fn(),
}));

import { getRequestAuth } from "@/lib/auth";
import {
  createPantryItem,
  deletePantryItem,
  listPantryItems,
  updatePantryItem,
} from "@/lib/kitchen-service";

const mockGetRequestAuth = vi.mocked(getRequestAuth);
const mockCreatePantryItem = vi.mocked(createPantryItem);
const mockDeletePantryItem = vi.mocked(deletePantryItem);
const mockListPantryItems = vi.mocked(listPantryItems);
const mockUpdatePantryItem = vi.mocked(updatePantryItem);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/pantry", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetRequestAuth.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/pantry"));

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
    expect(mockListPantryItems).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's items", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockListPantryItems.mockResolvedValue([fakeItem()]);

    const response = await GET(new Request("http://localhost/api/pantry"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([fakeItem()]);
    expect(mockListPantryItems).toHaveBeenCalledWith("user-123");
  });
});

describe("POST /api/pantry", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetRequestAuth.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "eggs" }),
    }));

    expect(response.status).toBe(401);
    expect(mockCreatePantryItem).not.toHaveBeenCalled();
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
    expect(mockCreatePantryItem).not.toHaveBeenCalled();
  });

  it("maps service validation errors to the existing 400 contract", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockCreatePantryItem.mockResolvedValue({
      ok: false,
      error: "name is required",
    });

    const response = await POST(new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("name is required");
    expect(mockCreatePantryItem).toHaveBeenCalledWith("user-123", {});
  });

  it("returns 201 with the service result", async () => {
    const item = fakeItem();
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockCreatePantryItem.mockResolvedValue({ ok: true, value: item });

    const response = await POST(new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "eggs", quantity: "12" }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(item);
  });
});

describe("PUT /api/pantry", () => {
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
    expect(mockUpdatePantryItem).not.toHaveBeenCalled();
  });

  it("preserves validation errors and successful updates", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockUpdatePantryItem
      .mockResolvedValueOnce({ ok: false, error: "id is required" })
      .mockResolvedValueOnce({
        ok: true,
        value: fakeItem({ quantity: "6" }),
      });

    const invalid = await PUT(new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ quantity: "6" }),
    }));
    const valid = await PUT(new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, quantity: "6" }),
    }));

    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("id is required");
    expect(valid.status).toBe(200);
    expect((await valid.json()).quantity).toBe("6");
  });
});

describe("DELETE /api/pantry", () => {
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
    expect(mockDeletePantryItem).not.toHaveBeenCalled();
  });

  it("preserves validation errors and the success response", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockDeletePantryItem
      .mockResolvedValueOnce({ ok: false, error: "id is required" })
      .mockResolvedValueOnce({ ok: true, value: null });

    const invalid = await DELETE(new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({}),
    }));
    const valid = await DELETE(new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({ id: 1 }),
    }));

    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("id is required");
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toEqual({ success: true });
  });
});
