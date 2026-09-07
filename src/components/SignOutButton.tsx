"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      // Clear the server-component cache when switching identities.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- discard cached account data on identity change
      window.location.assign("/login?returnTo=%2Faccount");
    } catch {
      setError("Could not sign out. Please try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        disabled={pending}
        onClick={signOut}
        className="min-h-11 disabled:opacity-50 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        {pending ? "Signing out…" : "Sign out / switch account"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-text-danger">{error}</p>}
    </div>
  );
}
