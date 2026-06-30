"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

function LoginForm() {
  const searchParams = useSearchParams();
  // Only honor same-origin, path-relative redirects. We navigate to returnTo with a
  // hard window.location.assign, so an attacker-supplied "//evil.com" (or any absolute
  // URL) would send a freshly-logged-in user off-site — an open-redirect phishing vector.
  // A leading "/" but NOT "//" means a same-origin path; anything else falls back to "/".
  const rawReturnTo = searchParams.get("returnTo") ?? "/";
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Both buttons run the same loading / timeout / error dance and differ only in
  // WHICH Supabase call they make — so the tricky parts (timeout, error mapping)
  // live here once and each handler just passes its auth call in.
  async function runAuth(authCall: () => Promise<{ error: AuthError | null }>) {
    setLoading(true);
    setError("");

    // A hung network must never leave the button stuck spinning with no result.
    // Promise.race against a timeout that resolves to a synthetic timeout marker.
    // Deliberate tradeoff: this does NOT abort the in-flight auth call. If it's merely
    // slow and succeeds at, say, 16s, the user sees "taking too long" while actually
    // being logged in. Acceptable at a 15s threshold (a real success is far faster);
    // revisit with an AbortController if slow-but-successful logins become common.
    const TIMEOUT_MS = 15_000;
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), TIMEOUT_MS),
    );

    const result = await Promise.race([authCall(), timeout]);

    if (result === "timeout") {
      setError("This is taking longer than expected — check your connection and try again.");
      setLoading(false);
      return;
    }

    const { error } = result;
    if (error) {
      // Map the few cases worth a tailored message; fall back to Supabase's own text.
      if (error.status === 429) {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    // Success. Use a HARD navigation, not router.push: a full page load guarantees
    // the freshly-set auth cookie is sent with the request, so middleware's
    // getUser() sees the session instead of racing it and bouncing back to /login.
    window.location.assign(returnTo);
  }

  const handleSignIn = () =>
    runAuth(() => supabase.auth.signInWithPassword({ email, password }));

  const handleSignUp = () => runAuth(() => supabase.auth.signUp({ email, password }));

  return (
    <main className="mx-auto flex h-screen max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-ink">
          <span className="font-serif text-2xl font-semibold text-paper">M</span>
        </div>
        <h1 className="font-serif text-2xl font-semibold text-ink">Welcome to Mise</h1>
        <p className="mt-1 text-sm text-muted">Your pantry-aware sous-chef</p>
      </div>

      <input
        className="mb-3 rounded-xl border border-sand bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-ink transition-colors"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="mb-4 rounded-xl border border-sand bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-ink transition-colors"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
      />

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2.5 text-sm font-medium text-ember"
        >
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          className="flex-1 rounded-xl bg-ember px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          onClick={handleSignIn}
          disabled={loading}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <button
          className="flex-1 rounded-xl border border-sand bg-surface px-4 py-2.5 text-sm text-ink disabled:opacity-50 hover:border-ink transition-colors"
          onClick={handleSignUp}
          disabled={loading}
        >
          Sign up
        </button>
      </div>
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
