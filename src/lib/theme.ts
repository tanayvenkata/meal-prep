export type ThemeMode = "light" | "dark" | "system";

// Also the cycle order ThemeToggle uses, and the single source of truth for
// what counts as a valid mode — layout.tsx validates the theme-mode cookie
// against this. Lives outside ThemeToggle.tsx (a "use client" file) because
// every export from a client file crosses the client boundary, and this
// needs to be callable from the server layout.
export const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];

export function isThemeMode(value: string | undefined): value is ThemeMode {
  return (THEME_MODES as string[]).includes(value ?? "");
}

// Single source of truth for the two theme-color hex values — must match
// --light-paper/--dark-paper in globals.css (kept separate there since CSS
// custom properties can't import from TS). Read from both layout.tsx
// (server, via generateViewport) and ThemeToggle.tsx (client, to patch the
// <meta> tags live on toggle) so the two never drift apart.
export const THEME_COLORS = { light: "#f6f1e7", dark: "#1b1712" } as const;

// What each of the two <meta name="theme-color" media="..."> tags should
// read for a given mode. "system" gives them their natural distinct colors
// so the browser's own prefers-color-scheme matching drives OS-level
// changes with no JS; an explicit override gives both the same resolved
// color, since whichever tag the browser ends up honoring should show it.
export function themeColorEntries(mode: ThemeMode): { media: string; color: string }[] {
  if (mode === "system") {
    return [
      { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
      { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
    ];
  }
  const color = mode === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;
  return [
    { media: "(prefers-color-scheme: light)", color },
    { media: "(prefers-color-scheme: dark)", color },
  ];
}
