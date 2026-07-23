import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockGetClaims = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getClaims: mockGetClaims,
    },
  })),
}));

import { getRequestAuth } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: "user-123" } },
    error: null,
  });
});

describe("getRequestAuth", () => {
  it("returns null when no Authorization header is present", async () => {
    const request = new Request("http://localhost/api/pantry");
    const result = await getRequestAuth(request);

    expect(result).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockGetClaims).not.toHaveBeenCalled();
  });

  it("rejects a malformed authorization scheme", async () => {
    const request = new Request("http://localhost/api/pantry", {
      headers: { Authorization: "Basic not-a-bearer-token" },
    });

    await expect(getRequestAuth(request)).resolves.toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("returns a direct-session context when the token is valid", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    } as any);

    const request = new Request("http://localhost/api/pantry", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const result = await getRequestAuth(request);

    expect(result).toEqual({ userId: "user-123", oauthClientId: null });
    expect(mockGetUser).toHaveBeenCalledWith("valid-token");
    expect(mockGetClaims).toHaveBeenCalledWith("valid-token");
  });

  it("preserves a verified OAuth client identity", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    } as any);
    mockGetClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "user-123",
          client_id: "chatgpt-client",
        },
      },
      error: null,
    });

    const request = new Request("http://localhost/api/pantry", {
      headers: { Authorization: "Bearer oauth-token" },
    });

    await expect(getRequestAuth(request)).resolves.toEqual({
      userId: "user-123",
      oauthClientId: "chatgpt-client",
    });
  });

  it("returns null when token is present but Supabase returns no user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    } as any);

    const request = new Request("http://localhost/api/pantry", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    const result = await getRequestAuth(request);

    expect(result).toBeNull();
  });

  it("returns null when verified claims and the Auth user disagree", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    } as any);
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "different-user" } },
      error: null,
    });

    const request = new Request("http://localhost/api/pantry", {
      headers: { Authorization: "Bearer mismatched-token" },
    });

    await expect(getRequestAuth(request)).resolves.toBeNull();
  });
});
