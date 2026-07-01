"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

export default function NavLinks() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <div className="flex items-center gap-6">
      <Link
        href="/pantry"
        className="text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        Pantry
      </Link>
      <SignOutButton />
    </div>
  );
}
