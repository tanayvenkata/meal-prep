"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const AUTH_ERRORS: Record<string, string> = {
  missing_credentials: "Enter your email and password.",
  invalid_credentials: "That email or password is incorrect.",
  too_many_attempts: "Too many attempts. Please wait a few minutes and try again.",
  check_email: "Check your email to finish creating your account, then return here.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  // Only send same-origin, path-relative redirects to the server. The login route
  // validates this again before redirecting; the client check keeps the submitted
  // form honest, while the server check is the actual security boundary.
  const rawReturnTo = searchParams.get("returnTo") ?? "/";
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "/";
  const [loading, setLoading] = useState(false);
  const errorCode = searchParams.get("error");
  const error = errorCode ? AUTH_ERRORS[errorCode] ?? "Mise could not sign you in." : "";

  useEffect(() => {
    const resetAfterBackNavigation = (event: PageTransitionEvent) => {
      if (event.persisted) setLoading(false);
    };

    window.addEventListener("pageshow", resetAfterBackNavigation);
    return () => window.removeEventListener("pageshow", resetAfterBackNavigation);
  }, []);

  return (
    <main className="mx-auto flex h-screen max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-fill-inverse">
          <span className="font-serif text-2xl font-semibold text-text-inverse">M</span>
        </div>
        <h1 className="font-serif text-2xl font-semibold text-text-primary">Welcome to Mise</h1>
        <p className="mt-1 text-sm text-text-secondary">Your pantry-aware sous-chef</p>
      </div>

      <form action="/api/auth/login" method="post" onSubmit={() => setLoading(true)}>
        <input
          type="hidden"
          name="returnTo"
          value={returnTo}
          aria-label="Return destination"
        />
        <input
          className="mb-3 w-full rounded-xl border border-outline bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-outline-strong transition-colors"
          type="email"
          name="email"
          aria-label="Email"
          placeholder="Email"
          autoComplete="email"
          required
        />
        <input
          className="mb-4 w-full rounded-xl border border-outline bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-outline-strong transition-colors"
          type="password"
          name="password"
          aria-label="Password"
          placeholder="Password"
          autoComplete="current-password"
          required
        />

        {error && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-medium text-text-danger"
          >
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            name="intent"
            value="sign-in"
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="submit"
            name="intent"
            value="sign-up"
            className="flex-1 rounded-xl border border-outline bg-surface-raised px-4 py-2.5 text-sm text-text-primary disabled:opacity-50 hover:border-outline-strong transition-colors"
            disabled={loading}
          >
            Sign up
          </button>
        </div>
      </form>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
