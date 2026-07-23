export type InventoryListSort = "recent" | "name";

type InventoryListEntry = {
  id: number | string;
  name: string;
  created_at: string;
};

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

export function filterAndSortInventory<T extends InventoryListEntry>(
  entries: readonly T[],
  {
    query,
    sort,
  }: {
    query: string;
    sort: InventoryListSort;
  },
): T[] {
  const normalizedQuery = normalizedText(query);
  const filtered = normalizedQuery === ""
    ? [...entries]
    : entries.filter((entry) =>
      normalizedText(entry.name).includes(normalizedQuery)
    );

  return filtered.sort((left, right) => {
    if (sort === "recent") {
      const leftCreatedAt = Date.parse(left.created_at);
      const rightCreatedAt = Date.parse(right.created_at);
      const createdOrder = (Number.isNaN(rightCreatedAt) ? 0 : rightCreatedAt)
        - (Number.isNaN(leftCreatedAt) ? 0 : leftCreatedAt);
      if (createdOrder !== 0) return createdOrder;
    }

    const nameOrder = normalizedText(left.name).localeCompare(
      normalizedText(right.name),
      "en",
    );
    if (nameOrder !== 0) return nameOrder;
    return String(left.id).localeCompare(String(right.id), "en");
  });
}
