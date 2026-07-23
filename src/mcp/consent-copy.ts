export const MCP_CONSENT_COPY = {
  summary:
    "It can read your pantry and kitchen tools and, when you explicitly confirm, update quantities or apply reviewed receipt additions.",
  boundary:
    "Mise remains the permission boundary. This connection can atomically decrease consumed ingredients, increase restocks, and create pantry items only from exact receipt lines you review and confirm. It cannot rename or delete pantry items, convert units, infer receipt decisions, or change kitchen tools.",
} as const;
