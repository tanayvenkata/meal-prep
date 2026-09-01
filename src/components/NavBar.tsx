"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import type { ThemeMode } from "@/lib/theme";

export default function NavBar({ initialThemeMode }: { initialThemeMode: ThemeMode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-outline bg-surface-raised px-4 py-3 sm:px-6">
      <Link
        href="/pantry"
        className="font-serif text-xl font-semibold tracking-tight text-text-primary transition-colors hover:text-text-accent"
      >
        Mise
      </Link>

      <div className="flex items-center gap-3 sm:gap-6">
        {!isLogin && (
          <>
            <Link
              href="/pantry"
              className="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Pantry
            </Link>
            <Link
              href="/tools"
              className="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Tools
            </Link>
            <SignOutButton />
          </>
        )}
        <ThemeToggle initialMode={initialThemeMode} />
      </div>
    </nav>
  );
}
