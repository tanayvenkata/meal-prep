export const MCP_CONSENT_COPY = {
  summary:
    "It can read your pantry and kitchen tools and, when you explicitly ask, set one quantity or consume and restock one or several existing pantry items.",
  boundary:
    "Mise remains the permission boundary. This connection can change only the quantities of existing pantry items when you ask, including atomically decreasing consumed ingredients or increasing restocks. It cannot create, rename, or delete pantry items, convert units, or change kitchen tools.",
} as const;
