// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PantryPage from "@/app/pantry/page";
import { pantryApi, type PantryItem } from "@/lib/pantry-api";
import "./setup";

vi.mock("@/lib/pantry-api", () => ({
  pantryApi: {
    list: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const pantryItems: PantryItem[] = [
  {
    id: 1,
    name: "Eggs",
    quantity: "12",
    turnover: "high",
    created_at: "2026-07-23T12:00:00.000Z",
  },
  {
    id: 2,
    name: "Canned tomatoes",
    quantity: "2 cans",
    turnover: "low",
    created_at: "2026-07-22T12:00:00.000Z",
  },
];

describe("PantryPage request states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading rows while the pantry request is pending", () => {
    vi.mocked(pantryApi.list).mockReturnValue(new Promise(() => {}));

    render(<PantryPage />);

    expect(
      screen.getByRole("status", { name: "Loading pantry" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pantry-loading-rows").children).toHaveLength(3);
  });

  it("keeps the page usable when loading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(pantryApi.list).mockRejectedValue(new Error("network unavailable"));

    render(<PantryPage />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Loading pantry" }),
    ).not.toBeInTheDocument();
  });

  it("renders returned items in their turnover sections", async () => {
    vi.mocked(pantryApi.list).mockResolvedValue(pantryItems);

    render(<PantryPage />);

    expect(await screen.findByText("Eggs")).toBeInTheDocument();
    expect(screen.getByText("Canned tomatoes")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "High turnover" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Low turnover" }),
    ).toBeInTheDocument();
  });
});
