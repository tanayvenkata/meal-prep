"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import IconButton from "@/components/IconButton";
import { themeColorEntries, type ThemeMode } from "@/lib/theme";

const ICONS = { light: Sun, dark: Moon };

// layout.tsx's generateViewport() renders these correctly on first paint,
// but a click can't trigger a server re-render without a reload — so the
// live toggle needs this client-side patch, using the same media/color
// pairing generateViewport used, just applied via the DOM instead of SSR.
function syncThemeColorMeta(mode: ThemeMode) {
  const entries = themeColorEntries(mode);
  document.querySelectorAll('meta[name="theme-color"]').forEach((tag) => {
    const entry = entries.find((e) => e.media === tag.getAttribute("media")) ?? entries[0];
    tag.setAttribute("content", entry.color);
  });
}

function applyMode(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
  syncThemeColorMeta(mode);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `theme-mode=${mode}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}

export default function ThemeToggle({ initialMode }: { initialMode: ThemeMode }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  function cycle() {
    const next = mode === "light" ? "dark" : "light";
    applyMode(next);
    setMode(next);
  }

  const Icon = ICONS[mode];

  return (
    <IconButton onClick={cycle} aria-label={`Theme: ${mode}. Click to change.`}>
      <Icon size={18} strokeWidth={2.2} />
    </IconButton>
  );
}
