"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={signOut}
      className="text-sm text-muted hover:text-ink transition-colors"
    >
      Sign out
    </button>
  );
}
