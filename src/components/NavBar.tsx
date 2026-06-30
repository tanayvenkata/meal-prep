"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import SignOutButton from "@/components/SignOutButton";
import HistoryDrawer from "@/components/HistoryDrawer";

export default function NavBar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isLogin = pathname === "/login";

  return (
    <>
      <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-sand bg-surface px-6 py-3">
        <div className="flex items-center gap-3">
          {!isLogin && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-pantry-strip hover:text-ink transition-colors"
              aria-label="Open conversation history"
            >
              <Menu size={18} strokeWidth={2.2} />
            </button>
          )}
          <Link
            href="/"
            className="font-serif text-xl font-semibold tracking-tight text-ink hover:text-ember transition-colors"
          >
            Mise
          </Link>
        </div>

        {!isLogin && (
          <div className="flex items-center gap-6">
            <Link
              href="/pantry"
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              Pantry
            </Link>
            <SignOutButton />
          </div>
        )}
      </nav>

      <HistoryDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
