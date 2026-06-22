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
      className="text-sm text-gray-500 underline hover:text-black"
    >
      Sign out
    </button>
  );
}
