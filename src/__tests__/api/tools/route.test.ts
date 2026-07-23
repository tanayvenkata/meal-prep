import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST, PUT } from "@/app/api/tools/route";

vi.mock("@/lib/auth", () => ({ getRequestAuth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getKitchenTools: vi.fn(),
  addKitchenTool: vi.fn(),
  updateKitchenTool: vi.fn(),
  deleteKitchenTool: vi.fn(),
}));

import { getRequestAuth } from "@/lib/auth";
import { addKitchenTool, deleteKitchenTool, getKitchenTools, updateKitchenTool } from "@/lib/db";

const mockGetRequestAuth = vi.mocked(getRequestAuth);
const mockGetKitchenTools = vi.mocked(getKitchenTools);
const mockAddKitchenTool = vi.mocked(addKitchenTool);
const mockUpdateKitchenTool = vi.mocked(updateKitchenTool);
const mockDeleteKitchenTool = vi.mocked(deleteKitchenTool);
const tool = { id: "00000000-0000-0000-0000-000000000001", user_id: "user-123", name: "Air fryer", kind: "appliance", created_at: "2024-01-01" };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/tools", () => {
  it("requires authentication", async () => {
    mockGetRequestAuth.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/tools"))).status).toBe(401);
  });

  it("returns the authenticated user's tools", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockGetKitchenTools.mockResolvedValue([tool]);
    const response = await GET(new Request("http://localhost/api/tools"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([tool]);
  });
});

describe("POST /api/tools", () => {
  it("rejects an OAuth client token", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });
    const response = await POST(new Request("http://localhost/api/tools", {
      method: "POST",
      body: JSON.stringify({ name: "Air fryer", kind: "appliance" }),
    }));
    expect(response.status).toBe(403);
    expect(mockAddKitchenTool).not.toHaveBeenCalled();
  });

  it("creates a valid tool", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockAddKitchenTool.mockResolvedValue(tool);
    const response = await POST(new Request("http://localhost/api/tools", { method: "POST", body: JSON.stringify({ name: " Air fryer ", kind: "appliance" }) }));
    expect(response.status).toBe(201);
    expect(mockAddKitchenTool).toHaveBeenCalledWith("user-123", "Air fryer", "appliance");
  });

  it("rejects a missing kind", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    const response = await POST(new Request("http://localhost/api/tools", { method: "POST", body: JSON.stringify({ name: "Air fryer" }) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("kind is required");
  });
});

describe("PUT and DELETE /api/tools", () => {
  it("rejects OAuth client updates", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });
    const response = await PUT(new Request("http://localhost/api/tools", {
      method: "PUT",
      body: JSON.stringify({
        id: tool.id,
        name: "Convection oven",
        kind: "appliance",
      }),
    }));
    expect(response.status).toBe(403);
    expect(mockUpdateKitchenTool).not.toHaveBeenCalled();
  });

  it("rejects OAuth client deletes", async () => {
    mockGetRequestAuth.mockResolvedValue({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });
    const response = await DELETE(new Request("http://localhost/api/tools", {
      method: "DELETE",
      body: JSON.stringify({ id: tool.id }),
    }));
    expect(response.status).toBe(403);
    expect(mockDeleteKitchenTool).not.toHaveBeenCalled();
  });

  it("updates a tool", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockUpdateKitchenTool.mockResolvedValue({ ...tool, name: "Convection oven" });
    const response = await PUT(new Request("http://localhost/api/tools", { method: "PUT", body: JSON.stringify({ id: tool.id, name: "Convection oven", kind: "appliance" }) }));
    expect(response.status).toBe(200);
    expect(mockUpdateKitchenTool).toHaveBeenCalledWith("user-123", tool.id, "Convection oven", "appliance");
  });

  it("deletes a tool", async () => {
    mockGetRequestAuth.mockResolvedValue({ userId: "user-123", oauthClientId: null });
    mockDeleteKitchenTool.mockResolvedValue();
    const response = await DELETE(new Request("http://localhost/api/tools", { method: "DELETE", body: JSON.stringify({ id: tool.id }) }));
    expect(response.status).toBe(200);
    expect(mockDeleteKitchenTool).toHaveBeenCalledWith("user-123", tool.id);
  });
});
