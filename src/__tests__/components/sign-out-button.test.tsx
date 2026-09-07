// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "./setup";
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { signOut } } }));
import SignOutButton from "@/components/SignOutButton";
beforeEach(() => vi.resetAllMocks());
it.each(["returned", "thrown"])("reports %s sign-out failures and permits retry", async (kind) => {
  if (kind === "returned") signOut.mockResolvedValue({ error: new Error("failed") });
  else signOut.mockRejectedValue(new Error("network"));
  render(<SignOutButton />);
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out");
  expect(screen.getByRole("button")).toBeEnabled();
});
it("ends only this browser session and fully navigates to account sign-in", async () => {
  const original = window.location;
  const assign = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { assign } });
  try {
    signOut.mockResolvedValue({ error: null });
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/login?returnTo=%2Faccount"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  } finally {
    Object.defineProperty(window, "location", { configurable: true, value: original });
  }
});
