export type KitchenContext = {
  pantry: Array<{
    name: string;
    quantity: string;
    turnover: "high" | "low";
  }>;
  tools: Array<{ name: string; kind: string }>;
};

export function isKitchenContext(value: unknown): value is KitchenContext {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<KitchenContext>;
  return Array.isArray(candidate.pantry) && Array.isArray(candidate.tools);
}
