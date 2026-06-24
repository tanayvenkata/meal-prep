import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

import { getUserId } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUserId", () => {
  it("returns null when no Authorization header is present", async () => {
    const request = new Request("http://localhost/api/pantry");
    const result = await getUserId(request);

    expect(result).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("returns the user id when token is valid", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    } as any);

    const request = new Request("http://localhost/api/pantry", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const result = await getUserId(request);

    expect(result).toBe("user-123");
    expect(mockGetUser).toHaveBeenCalledWith("valid-token");
  });

  it("returns null when token is present but Supabase returns no user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    } as any);

    const request = new Request("http://localhost/api/pantry", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    const result = await getUserId(request);

    expect(result).toBeNull();
  });
});
