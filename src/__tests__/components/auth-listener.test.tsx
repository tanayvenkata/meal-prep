// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import AuthListener from "@/components/AuthListener";
import { supabase } from "@/lib/supabase";
import "./setup";

const mockPush = vi.fn();
let mockPathname = "/pantry";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockPathname,
}));

describe("AuthListener", () => {
  let authCallback: ((event: string, session: unknown) => void) | null = null;
  const mockUnsubscribe = vi.fn();

  beforeEach(() => {
    mockPush.mockClear();
    mockUnsubscribe.mockClear();
    authCallback = null;
    mockPathname = "/pantry";

    vi.spyOn(supabase.auth, "onAuthStateChange").mockImplementation(((callback: (event: string, session: unknown) => void) => {
      authCallback = callback;
      return {
        data: {
          subscription: {
            unsubscribe: mockUnsubscribe,
          },
        },
      };
    }) as unknown as typeof supabase.auth.onAuthStateChange);
  });

  it("redirects to login with preserved returnTo on SIGNED_OUT", () => {
    render(<AuthListener />);
    expect(authCallback).not.toBeNull();

    authCallback!("SIGNED_OUT", null);

    expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fpantry");
  });

  it("preserves location query params in returnTo", () => {
    window.history.pushState({}, "", "/pantry?sort=name");

    render(<AuthListener />);
    authCallback!("SIGNED_OUT", null);

    expect(mockPush).toHaveBeenCalledWith("/login?returnTo=%2Fpantry%3Fsort%3Dname");
  });

  it("does not redirect when already on /login", () => {
    mockPathname = "/login";
    render(<AuthListener />);

    expect(authCallback).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not redirect when on /reset-password", () => {
    mockPathname = "/reset-password";
    render(<AuthListener />);

    expect(authCallback).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = render(<AuthListener />);
    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
