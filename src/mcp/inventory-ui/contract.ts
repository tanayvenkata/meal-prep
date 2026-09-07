import { z } from "zod";

export const kitchenContextSchema = z.object({
  pantry: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      quantity: z.string(),
      quantityMode: z.enum([
        "unknown",
        "text",
        "structured",
        "unsupported",
      ]),
      quantityAmount: z.string().nullable(),
      quantityUnit: z.string().nullable(),
      turnover: z.enum(["high", "low"]),
    }),
  ),
  tools: z.array(
    z.object({ id: z.uuid(), name: z.string(), kind: z.string() }),
  ),
});

export type KitchenSnapshot = z.infer<typeof kitchenContextSchema>;
