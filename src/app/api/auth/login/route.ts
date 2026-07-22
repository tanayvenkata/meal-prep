import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

type AuthIntent = "sign-in" | "sign-up";

function safeReturnPath(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

function publicOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);

  return host ? `${protocol}://${host}` : new URL(request.url).origin;
}

function loginRedirect(request: NextRequest, returnTo: string, error: string) {
  const url = new URL("/login", publicOrigin(request));
  url.searchParams.set("returnTo", returnTo);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

function hasSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === publicOrigin(request);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // A login endpoint can otherwise be used for login-CSRF: another site could
  // silently sign a visitor into an attacker's account. Native Mise forms send
  // their own origin, so reject cross-origin submissions before reading credentials.
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid login origin." }, { status: 403 });
  }

  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const intent: AuthIntent = formData.get("intent") === "sign-up" ? "sign-up" : "sign-in";

  if (typeof email !== "string" || typeof password !== "string") {
    return loginRedirect(request, returnTo, "missing_credentials");
  }

  // Build the redirect first, then let Supabase attach its session cookies to
  // that exact response. The browser receives Set-Cookie + 303 atomically and
  // follows the redirect to consent with the new session already present.
  const response = NextResponse.redirect(new URL(returnTo, publicOrigin(request)), 303);
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

  const result =
    intent === "sign-up"
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });

  if (result.error) {
    const error = result.error.status === 429 ? "too_many_attempts" : "invalid_credentials";
    return loginRedirect(request, returnTo, error);
  }

  if (intent === "sign-up" && !result.data.session) {
    return loginRedirect(request, returnTo, "check_email");
  }

  return response;
}
