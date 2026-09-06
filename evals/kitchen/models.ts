// Standard API prices checked 2026-09-06:
// https://developers.openai.com/api/docs/pricing
// Unknown cache-write usage is charged conservatively, never assumed free.
export const actorProfiles = {
  "gpt-5.4-mini-2026-03-17": { reservationUsd: 0.32 },
  "gpt-5.6-luna": { reservationUsd: 0.60 },
} as const;
export type ActorModel = keyof typeof actorProfiles;
export function actorModel(value = "gpt-5.6-luna"): ActorModel {
  if (!Object.hasOwn(actorProfiles, value)) throw new Error("unsupported_evaluation_model");
  return value as ActorModel;
}
export function actorUsageCost(model: ActorModel, usage: {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
}) {
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const writes = usage.input_tokens_details?.cache_write_tokens;
  for (const n of [input, output, cached, ...(writes === undefined ? [] : [writes])]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("invalid_token_usage");
  }
  if (cached + (writes ?? 0) > input || output > 2048) throw new Error("invalid_token_usage");
  // Preserve the historical baseline's conservative, uncached estimate.
  if (model === "gpt-5.4-mini-2026-03-17") return (input * 0.75 + output * 4.5) / 1e6;
  const long = input > 272_000;
  const rate = long ? 0.4 : 0.2;
  const cacheWrites = writes ?? (input - cached);
  return ((input - cached - cacheWrites) * rate + cached * rate * 0.1 + cacheWrites * rate * 1.25 + output * (long ? 1.8 : 1.2)) / 1e6;
}
