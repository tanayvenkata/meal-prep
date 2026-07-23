import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST, PUT } from "@/app/api/tools/route";

vi.mock("@/lib/auth", () => ({ getRequestAuth: vi.fn() }));
vi.mock("@/lib/kitchen-service", () => ({
  createKitchenTool: vi.fn(),
  deleteKitchenTool: vi.fn(),
  listKitchenTools: vi.fn(),
  updateKitchenTool: vi.fn(),
}));

import { getRequestAuth } from "@/lib/auth";
import {
  createKitchenTool,
  deleteKitchenTool,
  listKitchenTools,
  updateKitchenTool,
} from "@/lib/kitchen-service";

const mockGetRequestAuth = vi.mocked(getRequestAuth);
const mockCreateKitchenTool = vi.mocked(createKitchenTool);
const mockDeleteKitchenTool = vi.mocked(deleteKitchenTool);
const mockListKitchenTools = vi.mocked(listKitchenTools);
const mockUpdateKitchenTool = vi.mocked(updateKitchenTool);
const tool = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "user-123",
  name: "Air fryer",
  kind: "appliance",
  created_at: "2024-01-01",
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/tools", () => {
  it("requires authentication", async () => {
    mockGetRequestAuth.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/tools"))).status).toBe(401);
    expect(mockListKitchenTools).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's tools", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockListKitchenTools.mockResolvedValue([tool]);

    const response = await GET(new Request("http://localhost/api/tools"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([tool]);
    expect(mockListKitchenTools).toHaveBeenCalledWith("user-123");
  });
});

describe("POST /api/tools", () => {
  it("rejects an OAuth client token before the service", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });

    const response = await POST(new Request("http://localhost/api/tools", {
      method: "POST",
      body: JSON.stringify({ name: "Air fryer", kind: "appliance" }),
    }));

    expect(response.status).toBe(403);
    expect(mockCreateKitchenTool).not.toHaveBeenCalled();
  });

  it("maps validation errors and successful creation", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockCreateKitchenTool
      .mockResolvedValueOnce({ ok: false, error: "kind is required" })
      .mockResolvedValueOnce({ ok: true, value: tool });

    const invalid = await POST(new Request("http://localhost/api/tools", {
      method: "POST",
      body: JSON.stringify({ name: "Air fryer" }),
    }));
    const valid = await POST(new Request("http://localhost/api/tools", {
      method: "POST",
      body: JSON.stringify({ name: " Air fryer ", kind: "appliance" }),
    }));

    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("kind is required");
    expect(valid.status).toBe(201);
    await expect(valid.json()).resolves.toEqual(tool);
  });
});

describe("PUT and DELETE /api/tools", () => {
  it("rejects OAuth client mutations before the service", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });

    const updateResponse = await PUT(new Request("http://localhost/api/tools", {
      method: "PUT",
      body: JSON.stringify({
        id: tool.id,
        name: "Convection oven",
        kind: "appliance",
      }),
    }));
    const deleteResponse = await DELETE(new Request("http://localhost/api/tools", {
      method: "DELETE",
      body: JSON.stringify({ id: tool.id }),
    }));

    expect(updateResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
    expect(mockUpdateKitchenTool).not.toHaveBeenCalled();
    expect(mockDeleteKitchenTool).not.toHaveBeenCalled();
  });

  it("maps a valid update and deletion", async () => {
    const updated = { ...tool, name: "Convection oven" };
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: null,
    });
    mockUpdateKitchenTool.mockResolvedValue({ ok: true, value: updated });
    mockDeleteKitchenTool.mockResolvedValue({ ok: true, value: null });

    const updateResponse = await PUT(new Request("http://localhost/api/tools", {
      method: "PUT",
      body: JSON.stringify({
        id: tool.id,
        name: "Convection oven",
        kind: "appliance",
      }),
    }));
    const deleteResponse = await DELETE(new Request("http://localhost/api/tools", {
      method: "DELETE",
      body: JSON.stringify({ id: tool.id }),
    }));

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual(updated);
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({ success: true });
  });
});
