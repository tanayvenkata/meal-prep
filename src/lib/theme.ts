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
