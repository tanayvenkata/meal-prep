import { createServerClient } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }

  try {
    const parsed = new URL(value, "http://localhost");
    if (parsed.origin !== "http://localhost") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);

  return host ? `${protocol}://${host}` : new URL(request.url).origin;
}

function buildDestinationUrl(origin: string, next: string | null, returnTo: string): URL {
  if (next && next !== "/") {
    const safeNext = safeReturnPath(next);
    const dest = new URL(safeNext, origin);
    if (returnTo && returnTo !== "/" && !dest.searchParams.has("returnTo")) {
      dest.searchParams.set("returnTo", returnTo);
    }
    return dest;
  }
  return new URL(returnTo, origin);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const origin = publicOrigin(request);

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawReturnTo = searchParams.get("returnTo");
  const returnTo = safeReturnPath(rawReturnTo);
  const rawNext = searchParams.get("next");
  const next = rawNext ? safeReturnPath(rawNext) : null;
  const errorParam = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const isRecoveryFlow =
    next?.includes("/reset-password") || type === "recovery" || errorCode === "otp_expired";

  if (errorParam) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("returnTo", returnTo);
    loginUrl.searchParams.set(
      "error",
      isRecoveryFlow ? "reset_link_expired" : errorParam,
    );
    return NextResponse.redirect(loginUrl, 303);
  }

  if (!code && (!tokenHash || !type)) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("returnTo", returnTo);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl, 303);
  }

  const targetUrl = buildDestinationUrl(origin, next, returnTo);
  const response = NextResponse.redirect(targetUrl, 303);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  let exchangeError = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchangeError = error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    exchangeError = error;
  }

  if (exchangeError) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("returnTo", returnTo);
    loginUrl.searchParams.set(
      "error",
      isRecoveryFlow ? "reset_link_expired" : "auth_callback_failed",
    );
    const errorResponse = NextResponse.redirect(loginUrl, 303);
    response.cookies.getAll().forEach((cookie) => {
      errorResponse.cookies.set(cookie);
    });
    return errorResponse;
  }

  return response;
}
