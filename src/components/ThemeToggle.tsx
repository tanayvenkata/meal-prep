"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import IconButton from "@/components/IconButton";
import { themeColorEntries, type ThemeMode } from "@/lib/theme";

const ICONS = { light: Sun, dark: Moon };

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

function subscribeToThemeClass(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getThemeSnapshot(): ThemeMode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export default function ThemeToggle({ initialMode = "light" }: { initialMode?: ThemeMode } = {}) {
  const mode = useSyncExternalStore(subscribeToThemeClass, getThemeSnapshot, () => initialMode);

  function cycle() {
    const next = mode === "light" ? "dark" : "light";
    applyMode(next);
  }

  const Icon = ICONS[mode];

  return (
    <IconButton
      onClick={cycle}
      aria-label={`Theme: ${mode}. Click to change.`}
      suppressHydrationWarning
    >
      <Icon size={18} strokeWidth={2.2} />
    </IconButton>
  );
}
