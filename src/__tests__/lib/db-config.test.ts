import { describe, expect, it, vi } from "vitest";

const { mockPostgres } = vi.hoisted(() => ({
  mockPostgres: vi.fn(() => ({})),
}));

vi.mock("postgres", () => ({
  default: mockPostgres,
}));

describe("database client configuration", () => {
  it("disables prepared statements for transaction-pooler compatibility", async () => {
    await import("@/lib/db");

    expect(mockPostgres).toHaveBeenCalledOnce();
    expect(mockPostgres).toHaveBeenCalledWith(process.env.DATABASE_URL, {
      prepare: false,
    });
  });
});
