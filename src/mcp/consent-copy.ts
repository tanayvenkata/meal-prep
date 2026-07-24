export const MCP_CONSENT_COPY = {
  summary:
    "It can read and manage your pantry and kitchen tools when you explicitly ask, including reviewed receipt additions.",
  boundary:
    "Mise remains the permission boundary. This connection can create, edit, and delete your pantry items and kitchen tools after clear current-turn requests; atomically adjust quantities; and apply exact receipt lines you review and confirm. It cannot convert units, infer receipt decisions, access another kitchen, or manage conversations and account data.",
} as const;
