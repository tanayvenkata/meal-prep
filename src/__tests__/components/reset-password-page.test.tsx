// @vitest-environment jsdom

import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "./setup";

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockGetSearchParams = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockGetSearchParams(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

import ResetPasswordPage from "@/app/reset-password/page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSearchParams.mockReturnValue(new URLSearchParams());
  mockOnAuthStateChange.mockReturnValue({
    data: {
      subscription: { unsubscribe: vi.fn() },
    },
  });
});

describe("ResetPasswordPage", () => {
  it("renders expired link state if there is no active session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /reset link expired/i }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("This password reset link is invalid or has expired."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /return to sign in/i }),
    ).toBeInTheDocument();
  });

  it("renders the password update form when an active session exists", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: "user@test.dev" } },
      error: null,
    });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /create new password/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirm new password$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /update password/i }),
    ).toBeInTheDocument();
  });

  it("validates that password is at least 6 characters", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "123" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 6 characters."),
      ).toBeInTheDocument();
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("validates that passwords match", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "different123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("calls updateUser and navigates to returnTo on success", async () => {
    mockGetSearchParams.mockReturnValue(
      new URLSearchParams({ returnTo: "/oauth/consent?authorization_id=auth-xyz" }),
    );
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });

    // Mock window.location
    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: "" } as unknown as Location;
    Object.defineProperty(window, "location", {
      writable: true,
      value: mockLocation,
    });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "brandNewPass123" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "brandNewPass123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({
        password: "brandNewPass123",
      });
    });

    await waitFor(() => {
      expect(window.location.href).toBe("/oauth/consent?authorization_id=auth-xyz");
    });

    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  it("displays error if updateUser fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    mockUpdateUser.mockResolvedValue({
      data: null,
      error: { message: "Auth session missing!" },
    });

    render(<ResetPasswordPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "validPass123" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "validPass123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() => {
      expect(screen.getByText("Auth session missing!")).toBeInTheDocument();
    });
  });
});
