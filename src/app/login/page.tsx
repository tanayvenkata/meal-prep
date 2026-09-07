"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const AUTH_ERRORS: Record<string, string> = {
  missing_credentials: "Enter your email and password.",
  invalid_credentials: "That email or password is incorrect.",
  too_many_attempts: "Too many attempts. Please wait a few minutes and try again.",
  check_email: "Check your email to finish creating your account, then return here.",
  missing_code: "Authentication link was missing a required code.",
  auth_callback_failed: "Sign-in failed. Please try again or request a new link.",
  reset_link_expired: "This password reset link has expired. Please request a new one.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  // Only send same-origin, path-relative redirects to the server. The login route
  // validates this again before redirecting; the client check keeps the submitted
  // form honest, while the server check is the actual security boundary.
  const rawReturnTo = searchParams.get("returnTo") ?? "/";
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") && !rawReturnTo.startsWith("/\\")
      ? rawReturnTo
      : "/";

  const [mode, setMode] = useState<"sign-in" | "forgot-password">("sign-in");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthProvider, setOAuthProvider] = useState<"google" | "github" | null>(null);
  const oauthLoading = oauthProvider !== null;
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [clientError, setClientError] = useState("");

  const errorCode = searchParams.get("error");
  const serverError = errorCode ? AUTH_ERRORS[errorCode] ?? "Mise could not sign you in." : "";
  const displayError = clientError || (mode === "sign-in" ? serverError : "");

  useEffect(() => {
    const resetAfterBackNavigation = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setLoading(false);
        setOAuthProvider(null);
        setResetLoading(false);
      }
    };

    window.addEventListener("pageshow", resetAfterBackNavigation);
    return () => window.removeEventListener("pageshow", resetAfterBackNavigation);
  }, []);

  const handleOAuthSignIn = async (provider: "google" | "github") => {
    const providerName = provider === "google" ? "Google" : "GitHub";
    setOAuthProvider(provider);
    setClientError("");
    try {
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });
      if (error) {
        setClientError(error.message || `Could not sign in with ${providerName}.`);
        setOAuthProvider(null);
      }
    } catch {
      setClientError(`An unexpected error occurred while connecting to ${providerName}.`);
      setOAuthProvider(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError("");
    if (!email.trim()) {
      setClientError("Enter your email.");
      return;
    }

    setResetLoading(true);
    try {
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=/reset-password&returnTo=${encodeURIComponent(returnTo)}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) {
        if (error.status === 429) {
          setClientError("Too many attempts. Please wait a few minutes and try again.");
        } else {
          setClientError(error.message || "Failed to send reset link.");
        }
      } else {
        setResetSuccess(true);
      }
    } catch {
      setClientError("An unexpected error occurred. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  if (mode === "forgot-password") {
    return (
      <main className="mx-auto flex h-screen max-w-sm flex-col justify-center px-4">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-fill-inverse">
            <span className="font-serif text-2xl font-semibold text-text-inverse">M</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-text-primary">Reset password</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Enter your email to receive a password reset link
          </p>
        </div>

        {resetSuccess ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-outline bg-surface-raised px-4 py-3 text-sm text-text-primary">
              Check your email for a link to reset your password. Once updated, you’ll be returned to your destination.
            </div>
            <button
              type="button"
              onClick={() => {
                setMode("sign-in");
                setResetSuccess(false);
                setClientError("");
              }}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleResetPassword}>
            <input
              className="mb-4 w-full rounded-xl border border-outline bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-outline-strong transition-colors"
              type="email"
              name="email"
              aria-label="Email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={resetLoading}
            />

            {displayError && (
              <p
                role="alert"
                className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-medium text-text-danger"
              >
                {displayError}
              </p>
            )}

            <button
              type="submit"
              className="mb-3 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
              disabled={resetLoading}
            >
              {resetLoading ? "Sending reset link…" : "Send reset link"}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setMode("sign-in");
                  setClientError("");
                }}
                className="text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-screen max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-fill-inverse">
          <span className="font-serif text-2xl font-semibold text-text-inverse">M</span>
        </div>
        <h1 className="font-serif text-2xl font-semibold text-text-primary">Welcome to Mise</h1>
        <p className="mt-1 text-sm text-text-secondary">Your pantry-aware sous-chef</p>
      </div>

      <button
        type="button"
        onClick={() => handleOAuthSignIn("google")}
        disabled={loading || oauthLoading}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-outline bg-surface-raised px-4 py-2.5 text-sm font-medium text-text-primary hover:border-outline-strong disabled:opacity-50 transition-colors"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>{oauthProvider === "google" ? "Connecting to Google…" : "Continue with Google"}</span>
      </button>

      <button
        type="button"
        onClick={() => handleOAuthSignIn("github")}
        disabled={loading || oauthLoading}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-outline bg-surface-raised px-4 py-2.5 text-sm font-medium text-text-primary hover:border-outline-strong disabled:opacity-50 transition-colors"
      >
        <span>{oauthProvider === "github" ? "Connecting to GitHub…" : "Continue with GitHub"}</span>
      </button>

      <div className="relative mb-4 flex items-center text-xs text-text-secondary before:flex-1 before:border-t before:border-outline after:flex-1 after:border-t after:border-outline">
        <span className="px-2">or</span>
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading || oauthLoading}
        />
        <input
          className="mb-1 w-full rounded-xl border border-outline bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-outline-strong transition-colors"
          type="password"
          name="password"
          aria-label="Password"
          placeholder="Password"
          autoComplete="current-password"
          required
          disabled={loading || oauthLoading}
        />

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setMode("forgot-password");
              setClientError("");
              setResetSuccess(false);
            }}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Forgot password?
          </button>
        </div>

        {displayError && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-medium text-text-danger"
          >
            {displayError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            name="intent"
            value="sign-in"
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
            disabled={loading || oauthLoading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="submit"
            name="intent"
            value="sign-up"
            className="flex-1 rounded-xl border border-outline bg-surface-raised px-4 py-2.5 text-sm text-text-primary disabled:opacity-50 hover:border-outline-strong transition-colors"
            disabled={loading || oauthLoading}
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
