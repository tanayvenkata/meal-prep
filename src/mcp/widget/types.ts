export type KitchenContext = {
  pantry: Array<{
    name: string;
    quantity: string;
    turnover: "high" | "low";
    quantityMode?: "unknown" | "text" | "structured" | "unsupported";
    quantityAmount?: string | null;
    quantityUnit?: string | null;
  }>;
  tools: Array<{ name: string; kind: string }>;
};

export function isKitchenContext(value: unknown): value is KitchenContext {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<KitchenContext>;
  return Array.isArray(candidate.pantry) && Array.isArray(candidate.tools);
}
