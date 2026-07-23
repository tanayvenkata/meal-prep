export const MCP_CONSENT_COPY = {
  summary:
    "It can read your pantry and kitchen tools and, when you explicitly ask, set, consume, or restock the quantity of one existing pantry item.",
  boundary:
    "Mise remains the permission boundary. This connection can change only the quantity of an existing pantry item when you ask, including decreasing it for consumed ingredients or increasing it for restocks. It cannot create, rename, or delete pantry items, or change kitchen tools.",
} as const;
