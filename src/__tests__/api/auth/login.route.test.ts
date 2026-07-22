import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from "@supabase/ssr";
import { POST } from "@/app/api/auth/login/route";

const mockCreateServerClient = vi.mocked(createServerClient);
const signInWithPassword = vi.fn();
const signUp = vi.fn();

function request(
  fields: Record<string, string>,
  origin = "http://localhost:3000",
  forwarded?: { host: string; protocol: string },
) {
  const body = new FormData();
  Object.entries(fields).forEach(([name, value]) => body.set(name, value));
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin,
      ...(forwarded
        ? {
            "x-forwarded-host": forwarded.host,
            "x-forwarded-proto": forwarded.protocol,
          }
        : {}),
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";

  mockCreateServerClient.mockImplementation((...args: any[]) => {
    const options = args[2];
    options.cookies.setAll([
      {
        name: "sb-session",
        value: "fresh-session",
        options: { httpOnly: true, sameSite: "lax", path: "/" },
      },
    ]);
    return {
      auth: { signInWithPassword, signUp },
    } as any;
  });
});

describe("POST /api/auth/login", () => {
  it("sets the session cookie and redirects directly back to OAuth consent", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    const response = await POST(
      request({
        email: "test@local.dev",
        password: "password123",
        intent: "sign-in",
        returnTo: "/oauth/consent?authorization_id=request-123",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/oauth/consent?authorization_id=request-123",
    );
    expect(response.headers.get("set-cookie")).toContain("sb-session=fresh-session");
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "test@local.dev",
      password: "password123",
    });
  });

  it("rejects a cross-origin login submission", async () => {
    const response = await POST(
      request(
        { email: "test@local.dev", password: "password123" },
        "https://attacker.example",
      ),
    );

    expect(response.status).toBe(403);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("keeps the redirect and cookie on the public tunnel origin", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    const response = await POST(
      request(
        {
          email: "test@local.dev",
          password: "password123",
          returnTo: "/oauth/consent?authorization_id=request-123",
        },
        "https://mise-test.ngrok.app",
        { host: "mise-test.ngrok.app", protocol: "https" },
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://mise-test.ngrok.app/oauth/consent?authorization_id=request-123",
    );
    expect(response.headers.get("set-cookie")).toContain("sb-session=fresh-session");
  });

  it("does not allow an external return URL", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    const response = await POST(
      request({
        email: "test@local.dev",
        password: "password123",
        returnTo: "//attacker.example/steal",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("returns to login with the OAuth context after invalid credentials", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { status: 400 },
    });

    const response = await POST(
      request({
        email: "test@local.dev",
        password: "wrong",
        returnTo: "/oauth/consent?authorization_id=request-123",
      }),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("returnTo")).toBe(
      "/oauth/consent?authorization_id=request-123",
    );
    expect(location.searchParams.get("error")).toBe("invalid_credentials");
  });
});
