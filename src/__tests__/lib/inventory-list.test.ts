import { describe, expect, it } from "vitest";
import { filterAndSortInventory } from "@/lib/inventory-list";

const entries = [
  {
    id: 1,
    name: "Zojirushi rice cooker",
    created_at: "2026-07-20T12:00:00Z",
  },
  {
    id: 2,
    name: "Café press",
    created_at: "2026-07-22T12:00:00Z",
  },
  {
    id: 3,
    name: "Air fryer",
    created_at: "2026-07-21T12:00:00Z",
  },
] as const;

describe("filterAndSortInventory", () => {
  it("sorts recently added without mutating the source array", () => {
    const source = [...entries];

    const result = filterAndSortInventory(source, {
      query: "",
      sort: "recent",
    });

    expect(result.map(({ id }) => id)).toEqual([2, 3, 1]);
    expect(source.map(({ id }) => id)).toEqual([1, 2, 3]);
  });

  it("sorts names case-insensitively from A to Z", () => {
    const result = filterAndSortInventory(entries, {
      query: "",
      sort: "name",
    });

    expect(result.map(({ name }) => name)).toEqual([
      "Air fryer",
      "Café press",
      "Zojirushi rice cooker",
    ]);
  });

  it("matches Unicode, case, and collapsed-whitespace variants", () => {
    expect(filterAndSortInventory(entries, {
      query: " CAFE\u0301   PRESS ",
      sort: "recent",
    })).toEqual([entries[1]]);
  });

  it("returns an empty list when no names match", () => {
    expect(filterAndSortInventory(entries, {
      query: "skillet",
      sort: "name",
    })).toEqual([]);
  });

  it("uses id as a stable tie-break for equal names and timestamps", () => {
    const tied = [
      { id: "b", name: "Pan", created_at: "2026-07-20T12:00:00Z" },
      { id: "a", name: "pan", created_at: "2026-07-20T12:00:00Z" },
    ];

    expect(filterAndSortInventory(tied, {
      query: "",
      sort: "recent",
    }).map(({ id }) => id)).toEqual(["a", "b"]);
  });
});
