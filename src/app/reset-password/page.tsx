"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { type AuthChangeEvent, type Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get("returnTo") ?? "/";
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") && !rawReturnTo.startsWith("/\\")
      ? rawReturnTo
      : "/";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const { data } = await supabase.auth.getUser();
      if (mounted) {
        if (data?.user) {
          setHasSession(true);
        }
        setCheckingSession(false);
      }
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        if (session?.user || event === "PASSWORD_RECOVERY") {
          setHasSession(true);
          setCheckingSession(false);
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message || "Failed to update password. Please try again.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // Navigate to returnTo after setting the password
    window.location.href = returnTo;
  };

  if (checkingSession) {
    return (
      <main className="mx-auto flex h-screen max-w-sm flex-col justify-center px-4">
        <div className="text-center">
          <p className="text-sm text-text-secondary">Verifying reset link…</p>
        </div>
      </main>
    );
  }

  if (!hasSession) {
    return (
      <main className="mx-auto flex h-screen max-w-sm flex-col justify-center px-4">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-fill-inverse">
            <span className="font-serif text-2xl font-semibold text-text-inverse">M</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-text-primary">
            Reset link expired
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            This password reset link is invalid or has expired.
          </p>
        </div>

        <Link
          href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          className="w-full rounded-xl bg-accent px-4 py-2.5 text-center text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Return to sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-screen max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-fill-inverse">
          <span className="font-serif text-2xl font-semibold text-text-inverse">M</span>
        </div>
        <h1 className="font-serif text-2xl font-semibold text-text-primary">Create new password</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Enter a new password for your Mise account
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <input
          className="mb-3 w-full rounded-xl border border-outline bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-outline-strong transition-colors"
          type="password"
          name="password"
          aria-label="New password"
          placeholder="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading || success}
        />
        <input
          className="mb-4 w-full rounded-xl border border-outline bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-outline-strong transition-colors"
          type="password"
          name="confirmPassword"
          aria-label="Confirm new password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={loading || success}
        />

        {error && (
          <p
            role="alert"
            className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-medium text-text-danger"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="mb-3 rounded-xl border border-outline bg-surface-raised px-3 py-2.5 text-sm font-medium text-text-primary"
          >
            Password updated. Redirecting…
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          disabled={loading || success}
        >
          {loading ? "Updating password…" : "Update password"}
        </button>

        <div className="mt-4 text-center">
          <Link
            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel and back to sign in
          </Link>
        </div>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
