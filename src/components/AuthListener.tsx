"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export default function AuthListener() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/login" || pathname === "/reset-password") {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "SIGNED_OUT") {
        const search = typeof window !== "undefined" ? window.location.search : "";
        const returnTo = `${pathname}${search}`;
        router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
