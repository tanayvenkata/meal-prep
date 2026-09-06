import { z } from "zod";
import { PANTRY_QUANTITY_UNITS } from "./pantry-quantity";

// Experimental input contract; not registered on the live MCP server yet.
const name = z.string().trim().min(1).max(100);
const measured = z.object({
  amount: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/),
  unit: z.enum(PANTRY_QUANTITY_UNITS),
}).strict();
const quantity = z.union([
  measured,
  z.object({ mode: z.literal("unknown") }).strict(),
  z.object({ mode: z.literal("text"), text: name }).strict(),
]);
const pantryRef = { id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), expectedName: name };
const equipmentRef = { id: z.string().uuid(), expectedName: name };
const kind = z.enum(["appliance", "cookware", "bakeware"]);
const envelope = <T extends z.ZodType>(entry: T) => z.object({
  requestId: z.string().uuid().describe("New UUID for this requested write; reuse only for an identical retry."),
  items: z.array(entry).min(1).max(25),
}).strict();

export const candidateInputs = {
  read_kitchen: z.object({}).strict(),
  add_items: envelope(z.union([
    z.object({ collection: z.literal("pantry"), name, quantity: quantity.optional() }).strict(),
    z.object({ collection: z.literal("equipment"), name, kind }).strict(),
  ])),
  edit_items: envelope(z.union([
    z.object({ collection: z.literal("pantry"), ...pantryRef, operation: z.literal("replace"),
      name: name.optional(), quantity: quantity.optional(), turnover: z.enum(["high", "low"]).optional(),
    }).strict().refine(v => v.name !== undefined || v.quantity !== undefined || v.turnover !== undefined,
      "Provide at least one replacement field."),
    z.object({ collection: z.literal("pantry"), ...pantryRef, operation: z.enum(["increase", "decrease"]),
      expectedQuantity: measured, delta: measured.extend({ amount: measured.shape.amount.regex(/[1-9]/) }),
    }).strict(),
    z.object({ collection: z.literal("equipment"), ...equipmentRef, name, kind }).strict(),
  ])),
  remove_items: envelope(z.union([
    z.object({ collection: z.literal("pantry"), ...pantryRef }).strict(),
    z.object({ collection: z.literal("equipment"), ...equipmentRef }).strict(),
  ])),
};
