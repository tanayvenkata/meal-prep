import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST, PUT } from "@/app/api/pantry/route";
import { fakeItem } from "@/__tests__/helpers/fixtures";

vi.mock("@/lib/auth", () => ({
  getRequestAuth: vi.fn(),
}));
vi.mock("@/lib/kitchen-service", () => ({
  createPantryItem: vi.fn(),
  deletePantryItem: vi.fn(),
  deletePantryItems: vi.fn(),
  listPantryItems: vi.fn(),
  updatePantryItem: vi.fn(),
}));

import { getRequestAuth } from "@/lib/auth";
import {
  createPantryItem,
  deletePantryItem,
  deletePantryItems,
  listPantryItems,
  updatePantryItem,
} from "@/lib/kitchen-service";

const mockGetRequestAuth = vi.mocked(getRequestAuth);
const mockCreatePantryItem = vi.mocked(createPantryItem);
const mockDeletePantryItem = vi.mocked(deletePantryItem);
const mockDeletePantryItems = vi.mocked(deletePantryItems);
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
    await expect(response.json()).resolves.toEqual([{
      id: 1,
      name: "eggs",
      quantity: "12",
      turnover: "high",
      created_at: "2024-01-01",
    }]);
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

  it("returns 201 with the existing safe item contract when created", async () => {
    const item = fakeItem();
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockCreatePantryItem.mockResolvedValue({
      ok: true,
      value: { status: "created", item },
    });

    const response = await POST(new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: "eggs", quantity: "12" }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: 1,
      name: "eggs",
      quantity: "12",
      turnover: "high",
      created_at: "2024-01-01",
    });
  });

  it("maps a duplicate create to a typed 409 without ownership fields", async () => {
    const item = fakeItem({ name: "Eggs" });
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockCreatePantryItem.mockResolvedValue({
      ok: true,
      value: { status: "already_exists", item },
    });

    const response = await POST(new Request("http://localhost/api/pantry", {
      method: "POST",
      body: JSON.stringify({ name: " eggs ", quantity: "6" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      code: "already_exists",
      error: "That pantry item already exists.",
      existingItem: {
        id: 1,
        name: "Eggs",
        quantity: "12",
        turnover: "high",
        created_at: "2024-01-01",
      },
    });
    expect(body.existingItem).not.toHaveProperty("user_id");
    expect(body.existingItem).not.toHaveProperty("name_key");
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

  it("preserves validation errors and maps updated items to the safe 200 contract", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockUpdatePantryItem
      .mockResolvedValueOnce({ ok: false, error: "id is required" })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          status: "updated",
          item: fakeItem({ quantity: "6" }),
        },
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
    await expect(valid.json()).resolves.toEqual({
      id: 1,
      name: "eggs",
      quantity: "6",
      turnover: "high",
      created_at: "2024-01-01",
    });
  });

  it("returns the current item for an unchanged update", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockUpdatePantryItem.mockResolvedValue({
      ok: true,
      value: {
        status: "unchanged",
        item: fakeItem(),
      },
    });

    const response = await PUT(new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, quantity: "12" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("user_id");
  });

  it("maps a missing item to a typed 404", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockUpdatePantryItem.mockResolvedValue({
      ok: true,
      value: { status: "not_found", id: 42 },
    });

    const response = await PUT(new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 42, quantity: "6" }),
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "not_found",
      error: "That pantry item no longer exists.",
      id: 42,
    });
  });

  it("maps a rename collision to a typed 409 with safe conflict details", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockUpdatePantryItem.mockResolvedValue({
      ok: true,
      value: {
        status: "name_conflict",
        id: 1,
        conflictingItem: fakeItem({ id: 2, name: "Eggs" }),
      },
    });

    const response = await PUT(new Request("http://localhost/api/pantry", {
      method: "PUT",
      body: JSON.stringify({ id: 1, name: " eggs " }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      code: "name_conflict",
      error: "Another pantry item already uses that name.",
      id: 1,
      conflictingItem: {
        id: 2,
        name: "Eggs",
        quantity: "12",
        turnover: "high",
        created_at: "2024-01-01",
      },
    });
    expect(body.conflictingItem).not.toHaveProperty("user_id");
    expect(body.conflictingItem).not.toHaveProperty("name_key");
  });
});

describe("DELETE /api/pantry", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetRequestAuth.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({ ids: [1, 2] }),
    }));

    expect(response.status).toBe(401);
    expect(mockDeletePantryItems).not.toHaveBeenCalled();
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
    expect(mockDeletePantryItem).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });

    const response = await DELETE(new Request("http://localhost/api/pantry", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }));

    expect(response.status).toBe(400);
    expect(mockDeletePantryItem).not.toHaveBeenCalled();
    expect(mockDeletePantryItems).not.toHaveBeenCalled();
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

  it("validates and deletes an authenticated batch", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockDeletePantryItems
      .mockResolvedValueOnce({
        ok: false,
        error: "ids must be an array",
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { status: "deleted", ids: [1, 2] },
      });

    const invalid = await DELETE(new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({ ids: "not-an-array" }),
    }));
    const valid = await DELETE(new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({ ids: [1, 2] }),
    }));

    expect(invalid.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(mockDeletePantryItems).toHaveBeenLastCalledWith(
      "user-123",
      { ids: [1, 2] },
    );
  });

  it("does not report success for a mixed owned and foreign batch", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockDeletePantryItems.mockResolvedValue({
      ok: true,
      value: { status: "not_found", ids: [99] },
    });

    const response = await DELETE(new Request("http://localhost/api/pantry", {
      method: "DELETE",
      body: JSON.stringify({ ids: [1, 99] }),
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "not_found",
      error: "One or more pantry items no longer exist.",
      ids: [99],
    });
  });
});
