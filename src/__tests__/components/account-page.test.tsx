// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "./setup";
const { getUser, listGrants, redirect } = vi.hoisted(() => ({ getUser: vi.fn(), listGrants: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser, oauth: { listGrants } } }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/SignOutButton", () => ({ default: () => <button>Sign out / switch account</button> }));
import AccountPage from "@/app/account/page";
beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-123", email: "cook@example.com", identities: [{ provider: "google" }, { provider: "github" }, { provider: "email" }] } }, error: null });
  listGrants.mockResolvedValue({ data: [], error: null });
  redirect.mockImplementation(() => { throw new Error("redirect"); });
});
describe("Account page", () => {
  it("shows verified identity, linked providers, password action and no grants", async () => {
    render(await AccountPage());
    expect(screen.getByText("cook@example.com")).toBeInTheDocument();
    expect(screen.getByText("Google, GitHub, Email")).toBeInTheDocument();
    expect(screen.getByText("user-123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Update password" })).toHaveAttribute("href", "/reset-password?returnTo=%2Faccount");
    expect(screen.getByText(/No active app authorizations/)).toBeInTheDocument();
  });
  it("redirects unauthenticated visitors before looking up grants", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(AccountPage()).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/login?returnTo=%2Faccount");
    expect(listGrants).not.toHaveBeenCalled();
  });
  it("does not trust a user returned alongside an auth error", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "stale" } }, error: new Error("invalid") });
    await expect(AccountPage()).rejects.toThrow("redirect");
    expect(listGrants).not.toHaveBeenCalled();
  });
  it("shows each authorized app without treating unrelated clients as ChatGPT", async () => {
    listGrants.mockResolvedValue({ data: [{ client: { id: "gpt", name: "ChatGPT" } }, { client: { id: "other", name: "Another app" } }], error: null });
    render(await AccountPage());
    expect(screen.getByText(/ChatGPT$/, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/Another app/)).toBeInTheDocument();
    expect(screen.getByText(/does not confirm/)).toBeInTheDocument();
  });
  it.each(["returned", "thrown"])("keeps failure distinct from no authorization (%s)", async (kind) => {
    if (kind === "returned") listGrants.mockResolvedValue({ data: null, error: new Error("failed") });
    else listGrants.mockRejectedValue(new Error("network"));
    render(await AccountPage());
    expect(screen.getByRole("alert")).toHaveTextContent("Connection status unavailable");
    expect(screen.queryByText(/No active app authorizations/)).not.toBeInTheDocument();
    expect(screen.getByText("cook@example.com")).toBeInTheDocument();
  });
});
