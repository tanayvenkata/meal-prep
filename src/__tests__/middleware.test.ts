import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}));

import { createServerClient } from "@supabase/ssr";
import { middleware } from "../../middleware";

const mockCreateServerClient = vi.mocked(createServerClient);

function makeRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("middleware", () => {
  it("lets /login through without checking auth", async () => {
    const request = makeRequest("/login");
    const response = await middleware(request);

    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("redirects unauthenticated users to /login with returnTo", async () => {
    mockCreateServerClient.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any);

    const request = makeRequest("/pantry");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(response.headers.get("location")).toContain("returnTo=%2Fpantry");
  });

  it("lets authenticated users through", async () => {
    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-123" } },
        }),
      },
    } as any);

    const request = makeRequest("/pantry");
    const response = await middleware(request);

    expect(response.status).toBe(200);
  });
});
