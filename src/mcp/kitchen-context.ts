import { getItems, getKitchenTools } from "@/lib/db";

export async function loadKitchenContext(userId: string) {
  const [items, tools] = await Promise.all([
    getItems(userId),
    getKitchenTools(userId),
  ]);

  return {
    pantry: items.map(({ name, quantity, turnover }) => ({
      name,
      quantity,
      turnover,
    })),
    tools: tools.map(({ name, kind }) => ({ name, kind })),
  };
}
