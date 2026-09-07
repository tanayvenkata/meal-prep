import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

import { createServerClient } from "@supabase/ssr";
import { GET, safeReturnPath } from "@/app/auth/callback/route";

const mockCreateServerClient = vi.mocked(createServerClient);
const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();

function makeRequest(
  urlStr: string,
  forwarded?: { host: string; protocol: string },
) {
  const url = new URL(urlStr);
  return new NextRequest(urlStr, {
    method: "GET",
    headers: {
      host: url.host,
      ...(forwarded
        ? {
            "x-forwarded-host": forwarded.host,
            "x-forwarded-proto": forwarded.protocol,
          }
        : {}),
    },
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
        value: "callback-session-token",
        options: { httpOnly: true, sameSite: "lax", path: "/" },
      },
    ]);
    return {
      auth: { exchangeCodeForSession, verifyOtp },
    } as any;
  });
});

describe("safeReturnPath", () => {
  it("allows relative paths", () => {
    expect(safeReturnPath("/pantry")).toBe("/pantry");
    expect(safeReturnPath("/oauth/consent?authorization_id=123")).toBe(
      "/oauth/consent?authorization_id=123",
    );
  });

  it("sanitizes open redirects and dangerous protocols", () => {
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath("")).toBe("/");
    expect(safeReturnPath("//attacker.example/steal")).toBe("/");
    expect(safeReturnPath("/\\attacker.example")).toBe("/");
    expect(safeReturnPath("https://attacker.example")).toBe("/");
    expect(safeReturnPath("javascript:alert(1)")).toBe("/");
  });
});

describe("GET /auth/callback", () => {
  it("exchanges PKCE code and redirects directly to returnTo with cookies", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    const response = await GET(
      makeRequest(
        "http://localhost:3000/auth/callback?code=test-code&returnTo=/oauth/consent%3Fauthorization_id%3Dreq-1",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/oauth/consent?authorization_id=req-1",
    );
    expect(response.headers.get("set-cookie")).toContain("sb-session=callback-session-token");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("test-code");
  });

  it("exchanges code and redirects to next destination preserving returnTo", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    const response = await GET(
      makeRequest(
        "http://localhost:3000/auth/callback?code=test-code&next=/reset-password&returnTo=/oauth/consent%3Fauthorization_id%3Dreq-1",
      ),
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/reset-password");
    expect(location.searchParams.get("returnTo")).toBe(
      "/oauth/consent?authorization_id=req-1",
    );
    expect(response.headers.get("set-cookie")).toContain("sb-session=callback-session-token");
  });

  it("preserves tunnel public origin headers on redirect", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    const response = await GET(
      makeRequest(
        "http://localhost:3000/auth/callback?code=test-code&returnTo=/oauth/consent%3Fauthorization_id%3Dreq-1",
        { host: "mise.ngrok.app", protocol: "https" },
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://mise.ngrok.app/oauth/consent?authorization_id=req-1",
    );
  });

  it("redirects to /login if upstream error is passed", async () => {
    const response = await GET(
      makeRequest(
        "http://localhost:3000/auth/callback?error=access_denied&returnTo=/oauth/consent%3Fauthorization_id%3Dreq-1",
      ),
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("returnTo")).toBe(
      "/oauth/consent?authorization_id=req-1",
    );
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("redirects to /login if code and token_hash are missing", async () => {
    const response = await GET(
      makeRequest(
        "http://localhost:3000/auth/callback?returnTo=/oauth/consent%3Fauthorization_id%3Dreq-1",
      ),
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("missing_code");
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("redirects to /login when exchangeCodeForSession fails", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid code verifier" },
    });

    const response = await GET(
      makeRequest(
        "http://localhost:3000/auth/callback?code=bad-code&returnTo=/oauth/consent%3Fauthorization_id%3Dreq-1",
      ),
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("auth_callback_failed");
    expect(location.searchParams.get("returnTo")).toBe(
      "/oauth/consent?authorization_id=req-1",
    );
  });

  it("handles token_hash and type verification for email recovery", async () => {
    verifyOtp.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    const response = await GET(
      makeRequest(
        "http://localhost:3000/auth/callback?token_hash=token-hash-123&type=recovery&next=/reset-password&returnTo=/oauth/consent%3Fauthorization_id%3Dreq-1",
      ),
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/reset-password");
    expect(location.searchParams.get("returnTo")).toBe(
      "/oauth/consent?authorization_id=req-1",
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "token-hash-123",
      type: "recovery",
    });
  });

  it("sanitizes open redirect attempts in next and returnTo", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });

    const response = await GET(
      makeRequest(
        "http://localhost:3000/auth/callback?code=test-code&next=//attacker.example&returnTo=//attacker.example",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });
});
