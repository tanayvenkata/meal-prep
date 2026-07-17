import { describe, expect, it } from "vitest";
import { isThemeMode, themeColorEntries, THEME_COLORS, THEME_MODES } from "@/lib/theme";

describe("theme contract", () => {
  it("supports only explicit light and dark choices", () => {
    expect(THEME_MODES).toEqual(["light", "dark"]);
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("system")).toBe(false);
  });

  it("keeps both browser theme-color tags aligned with the selected mode", () => {
    for (const mode of THEME_MODES) {
      expect(themeColorEntries(mode)).toEqual([
        { media: "(prefers-color-scheme: light)", color: THEME_COLORS[mode] },
        { media: "(prefers-color-scheme: dark)", color: THEME_COLORS[mode] },
      ]);
    }
  });
});
