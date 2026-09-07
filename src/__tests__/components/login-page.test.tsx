// @vitest-environment jsdom

import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "./setup";

const mockSignInWithOAuth = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockGetSearchParams = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockGetSearchParams(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
    },
  },
}));

import Login from "@/app/login/page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSearchParams.mockReturnValue(new URLSearchParams());
});

describe("LoginPage", () => {
  it("renders the sign in form with Google OAuth and Forgot Password button", () => {
    render(<Login />);

    expect(screen.getByText("Welcome to Mise")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /forgot password\?/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
  });

  it("initiates Google OAuth preserving returnTo query param", async () => {
    mockGetSearchParams.mockReturnValue(
      new URLSearchParams({ returnTo: "/oauth/consent?authorization_id=req-1" }),
    );
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });

    render(<Login />);

    const googleBtn = screen.getByRole("button", { name: /continue with google/i });
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3Dreq-1`,
        },
      });
    });
  });

  it("displays error if Google OAuth fails", async () => {
    mockSignInWithOAuth.mockResolvedValue({
      data: null,
      error: { message: "Google OAuth popup was closed." },
    });

    render(<Login />);

    const googleBtn = screen.getByRole("button", { name: /continue with google/i });
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Google OAuth popup was closed."),
      ).toBeInTheDocument();
    });
  });

  it("switches to forgot password mode and submits reset request", async () => {
    mockGetSearchParams.mockReturnValue(
      new URLSearchParams({ returnTo: "/oauth/consent?authorization_id=req-2" }),
    );
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    render(<Login />);

    const forgotBtn = screen.getByRole("button", { name: /forgot password\?/i });
    fireEvent.click(forgotBtn);

    expect(screen.getByRole("heading", { name: /reset password/i })).toBeInTheDocument();

    const emailInput = screen.getByRole("textbox", { name: /email/i });
    fireEvent.change(emailInput, { target: { value: "chef@mise.test" } });

    const submitBtn = screen.getByRole("button", { name: /send reset link/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith("chef@mise.test", {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password&returnTo=%2Foauth%2Fconsent%3Fauthorization_id%3Dreq-2`,
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText(/check your email for a link to reset your password/i),
      ).toBeInTheDocument();
    });

    // Clicking "Back to sign in" returns to the login form
    const backBtn = screen.getByRole("button", { name: /back to sign in/i });
    fireEvent.click(backBtn);

    expect(screen.getByText("Welcome to Mise")).toBeInTheDocument();
  });

  it("displays error when resetPasswordForEmail returns rate limit", async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { status: 429, message: "Too many requests" },
    });

    render(<Login />);

    fireEvent.click(screen.getByRole("button", { name: /forgot password\?/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /email/i }), {
      target: { value: "chef@mise.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/too many attempts\. please wait a few minutes/i),
      ).toBeInTheDocument();
    });
  });

  it("displays server error code from query parameters", () => {
    mockGetSearchParams.mockReturnValue(
      new URLSearchParams({ error: "invalid_credentials" }),
    );

    render(<Login />);

    expect(
      screen.getByText("That email or password is incorrect."),
    ).toBeInTheDocument();
  });

  it("does not display sign-in server error when switching to forgot password mode", () => {
    mockGetSearchParams.mockReturnValue(
      new URLSearchParams({ error: "invalid_credentials" }),
    );

    render(<Login />);
    expect(screen.getByText("That email or password is incorrect.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /forgot password\?/i }));
    expect(screen.queryByText("That email or password is incorrect.")).not.toBeInTheDocument();
  });
});
