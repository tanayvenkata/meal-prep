"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push(returnTo);
    }
    setLoading(false);
  }

  async function handleSignUp() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push(returnTo);
    }
    setLoading(false);
  }

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

      {error && <p className="mb-3 text-sm text-ember">{error}</p>}

      <div className="flex gap-2">
        <button
          className="flex-1 rounded-xl bg-ember px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          onClick={handleSignIn}
          disabled={loading}
        >
          Sign in
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
