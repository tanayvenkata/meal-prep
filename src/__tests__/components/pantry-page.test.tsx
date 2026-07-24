// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    removeMany: vi.fn(),
  },
}));

const pantryItems: PantryItem[] = [
  {
    id: 1,
    name: "Eggs",
    quantity: "12",
    quantityDetails: {
      mode: "structured",
      amount: "12",
      unit: "count",
    },
    turnover: "high",
    created_at: "2026-07-23T12:00:00.000Z",
  },
  {
    id: 2,
    name: "Canned tomatoes",
    quantity: "2 cans",
    quantityDetails: {
      mode: "text",
      text: "2 cans",
    },
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

  it("adds a measured quantity with an explicit amount and unit", async () => {
    const user = userEvent.setup();
    vi.mocked(pantryApi.list)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(pantryApi.add).mockResolvedValue({
      id: 3,
      name: "Rice",
      quantity: "3 lb",
      quantityDetails: {
        mode: "structured",
        amount: "3",
        unit: "lb",
      },
      turnover: "high",
      created_at: "2026-07-23T13:00:00.000Z",
    });

    render(<PantryPage />);

    await user.type(screen.getByRole("textbox", { name: "Ingredient name" }), "Rice");
    await user.type(screen.getByRole("textbox", { name: "Quantity amount" }), "3");
    await user.selectOptions(screen.getByRole("combobox", { name: "Quantity unit" }), "lb");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(pantryApi.add).toHaveBeenCalledWith({
        name: "Rice",
        quantity: {
          mode: "structured",
          amount: "3",
          unit: "lb",
        },
        turnover: "high",
      });
    });
  });

  it("uses free text only after the user selects the custom fallback", async () => {
    const user = userEvent.setup();
    vi.mocked(pantryApi.list)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(pantryApi.add).mockResolvedValue({
      id: 4,
      name: "Rice",
      quantity: "about half a bag",
      quantityDetails: {
        mode: "text",
        text: "about half a bag",
      },
      turnover: "high",
      created_at: "2026-07-23T13:00:00.000Z",
    });

    render(<PantryPage />);

    await user.type(screen.getByRole("textbox", { name: "Ingredient name" }), "Rice");
    await user.click(screen.getByRole("button", { name: "Use custom text" }));
    await user.type(
      screen.getByRole("textbox", { name: "Quantity custom text" }),
      "about half a bag",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(pantryApi.add).toHaveBeenCalledWith({
        name: "Rice",
        quantity: {
          mode: "text",
          text: "about half a bag",
        },
        turnover: "high",
      });
    });
  });

  it("preserves a structured count when saving an unrelated edit", async () => {
    const user = userEvent.setup();
    vi.mocked(pantryApi.list)
      .mockResolvedValueOnce(pantryItems)
      .mockResolvedValueOnce(pantryItems);
    vi.mocked(pantryApi.update).mockResolvedValue(pantryItems[0]);

    render(<PantryPage />);

    const editButtons = await screen.findAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]);
    expect(screen.getByRole("textbox", { name: "Edit quantity amount" }))
      .toHaveValue("12");
    expect(screen.getByRole("combobox", { name: "Edit quantity unit" }))
      .toHaveValue("count");
    await user.clear(screen.getByRole("textbox", { name: "Edit ingredient name" }));
    await user.type(
      screen.getByRole("textbox", { name: "Edit ingredient name" }),
      "Duck eggs",
    );
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => {
      expect(pantryApi.update).toHaveBeenCalledWith({
        id: 1,
        name: "Duck eggs",
        turnover: "high",
      });
    });
  });

  it("updates a structured count without passing display text", async () => {
    const user = userEvent.setup();
    vi.mocked(pantryApi.list)
      .mockResolvedValueOnce(pantryItems)
      .mockResolvedValueOnce(pantryItems);
    vi.mocked(pantryApi.update).mockResolvedValue({
      ...pantryItems[0],
      quantity: "10",
      quantityDetails: {
        mode: "structured",
        amount: "10",
        unit: "count",
      },
    });

    render(<PantryPage />);

    const editButtons = await screen.findAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]);
    const amount = screen.getByRole("textbox", {
      name: "Edit quantity amount",
    });
    await user.clear(amount);
    await user.type(amount, "10");
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => {
      expect(pantryApi.update).toHaveBeenCalledWith({
        id: 1,
        name: "Eggs",
        quantity: {
          mode: "structured",
          amount: "10",
          unit: "count",
        },
        turnover: "high",
      });
    });
  });

  it("confirms and removes two selected items through the batch boundary", async () => {
    const user = userEvent.setup();
    vi.mocked(pantryApi.list)
      .mockResolvedValueOnce(pantryItems)
      .mockResolvedValueOnce([]);
    vi.mocked(pantryApi.removeMany).mockResolvedValue();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PantryPage />);

    await user.click(await screen.findByRole("button", { name: "Select items" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Eggs" }));
    expect(
      screen.getByRole("button", { name: "Delete selected" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", { name: "Select Canned tomatoes" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete selected" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Delete 2 selected pantry items? This cannot be undone.",
    );
    await waitFor(() => {
      expect(pantryApi.removeMany).toHaveBeenCalledWith([1, 2]);
    });
    expect(
      await screen.findByText("Nothing here yet. Add the ingredients you use."),
    ).toBeInTheDocument();
  });

  it("leaves selected items untouched when deletion is not confirmed", async () => {
    const user = userEvent.setup();
    vi.mocked(pantryApi.list).mockResolvedValue(pantryItems);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<PantryPage />);

    await user.click(await screen.findByRole("button", { name: "Select items" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Eggs" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Select Canned tomatoes" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete selected" }));

    expect(pantryApi.removeMany).not.toHaveBeenCalled();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });
});
