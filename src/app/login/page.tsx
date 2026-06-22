"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
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
      router.push("/");
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
      router.push("/");
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto flex h-screen max-w-sm flex-col justify-center p-4">
      <h1 className="mb-6 text-xl font-bold">Sign in to Meal Prep</h1>

      <input
        className="mb-3 rounded border p-2"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="mb-3 rounded border p-2"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
      />

      {error && <p className="mb-3 text-red-500 text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          className="flex-1 rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          onClick={handleSignIn}
          disabled={loading}
        >
          Sign in
        </button>
        <button
          className="flex-1 rounded border px-4 py-2 disabled:opacity-50"
          onClick={handleSignUp}
          disabled={loading}
        >
          Sign up
        </button>
      </div>
    </main>
  );
}
