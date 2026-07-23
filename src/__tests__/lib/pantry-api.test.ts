import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getToken: mockGetToken,
}));

import { PantryApiError, pantryApi } from "@/lib/pantry-api";

const item = {
  id: 7,
  name: "Eggs",
  quantity: "12",
  turnover: "high" as const,
  created_at: "2026-07-23T12:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetToken.mockResolvedValue("session-token");
  vi.stubGlobal("fetch", vi.fn());
});

describe("pantryApi", () => {
  it("lists pantry items with the current bearer token", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([item]), { status: 200 }),
    );

    await expect(pantryApi.list()).resolves.toEqual([item]);
    expect(fetch).toHaveBeenCalledWith("/api/pantry", {
      method: "GET",
      headers: { Authorization: "Bearer session-token" },
    });
  });

  it.each([
    [
      "add",
      () => pantryApi.add({
        name: "Eggs",
        quantity: "12",
        turnover: "high",
      }),
      "POST",
      { name: "Eggs", quantity: "12", turnover: "high" },
      item,
    ],
    [
      "update",
      () => pantryApi.update({
        id: 7,
        name: "Eggs",
        quantity: "6",
        turnover: "low",
      }),
      "PUT",
      { id: 7, name: "Eggs", quantity: "6", turnover: "low" },
      { ...item, quantity: "6", turnover: "low" },
    ],
    [
      "remove",
      () => pantryApi.remove(7),
      "DELETE",
      { id: 7 },
      { success: true },
    ],
  ] as const)(
    "sends typed %s mutations through the shared request contract",
    async (_name, call, method, body, responseBody) => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(responseBody), { status: 200 }),
      );

      await call();
      expect(fetch).toHaveBeenCalledWith("/api/pantry", {
        method,
        headers: {
          Authorization: "Bearer session-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    },
  );

  it("throws the server's typed error envelope", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        code: "already_exists",
        error: "That pantry item already exists.",
      }), { status: 409 }),
    );

    const error = await pantryApi.add({
      name: "Eggs",
      quantity: "12",
      turnover: "high",
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(PantryApiError);
    expect(error).toMatchObject({
      message: "That pantry item already exists.",
      status: 409,
      code: "already_exists",
    });
  });

  it("falls back safely when an error response is not JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("upstream unavailable", { status: 503 }),
    );

    await expect(pantryApi.list()).rejects.toMatchObject({
      message: "Pantry request failed (503).",
      status: 503,
      code: null,
    });
  });

  it("fails before fetch when the browser session is missing", async () => {
    mockGetToken.mockResolvedValue(null);

    await expect(pantryApi.list()).rejects.toMatchObject({
      message: "Your session has expired. Sign in again.",
      status: 401,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
