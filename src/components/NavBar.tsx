"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import SignOutButton from "@/components/SignOutButton";
import HistoryDrawer from "@/components/HistoryDrawer";
import ThemeToggle from "@/components/ThemeToggle";
import IconButton from "@/components/IconButton";
import type { ThemeMode } from "@/lib/theme";

export default function NavBar({ initialThemeMode }: { initialThemeMode: ThemeMode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isLogin = pathname === "/login";

  return (
    <>
      <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-outline bg-surface-raised px-6 py-3">
        <div className="flex items-center gap-3">
          {!isLogin && (
            <IconButton
              onClick={() => setDrawerOpen(true)}
              aria-label="Open conversation history"
            >
              <Menu size={18} strokeWidth={2.2} />
            </IconButton>
          )}
          <Link
            href="/"
            className="font-serif text-xl font-semibold tracking-tight text-text-primary hover:text-text-accent transition-colors"
          >
            Mise
          </Link>
        </div>

        <div className="flex items-center gap-6">
          {!isLogin && (
            <>
              <Link
                href="/pantry"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Pantry
              </Link>
              <SignOutButton />
            </>
          )}
          <ThemeToggle initialMode={initialThemeMode} />
        </div>
      </nav>

      <HistoryDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
