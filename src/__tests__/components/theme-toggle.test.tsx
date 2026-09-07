// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ThemeToggle from "@/components/ThemeToggle";
import "./setup";

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.cookie = "theme-mode=; path=/; max-age=0";
  });

  it("renders light mode icon by default and toggles to dark on click", () => {
    render(<ThemeToggle initialMode="light" />);

    const button = screen.getByRole("button", { name: /theme: light/i });
    expect(button).toBeDefined();

    fireEvent.click(button);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.cookie).toContain("theme-mode=dark");
  });

  it("renders dark mode when initialized with dark", () => {
    document.documentElement.classList.add("dark");
    render(<ThemeToggle initialMode="dark" />);

    const button = screen.getByRole("button", { name: /theme: dark/i });
    expect(button).toBeDefined();

    fireEvent.click(button);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.cookie).toContain("theme-mode=light");
  });
});
