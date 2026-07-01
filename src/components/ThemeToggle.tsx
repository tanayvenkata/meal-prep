"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import IconButton from "@/components/IconButton";
import { THEME_MODES, themeColorEntries, type ThemeMode } from "@/lib/theme";

const ICONS = { system: Monitor, light: Sun, dark: Moon };

function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

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
  document.documentElement.classList.toggle("dark", resolveDark(mode));
  syncThemeColorMeta(mode);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `theme-mode=${mode}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}

export default function ThemeToggle({ initialMode }: { initialMode: ThemeMode }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  // Only "system" needs to keep listening — an explicit light/dark choice
  // doesn't change until the user clicks again.
  useEffect(() => {
    if (mode !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => document.documentElement.classList.toggle("dark", media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  function cycle() {
    const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
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
