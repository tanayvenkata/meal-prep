export type PantryExpectation = { name: string; quantity: string };
export type Scenario = {
  id: string;
  prompt: string;
  seed: Array<{ name: string; quantity?: { amount: string; unit: string } }>;
  pantry: PantryExpectation[];
  equipment: Array<{ name: string; kind: string }>;
  forbidWrites?: boolean;
  preserveIds?: boolean;
};
export const scenarios: Scenario[] = [
  { id: "add-unknown", prompt: "i have mayo pls add", seed: [], pantry: [{ name: "mayo", quantity: "" }], equipment: [] },
  { id: "duplicate-add", prompt: "I have Mayo, please add it to my pantry.", seed: [{ name: "Mayo" }], pantry: [{ name: "mayo", quantity: "" }], equipment: [], preserveIds: true },
  { id: "half-jar", prompt: "Add Mayo to my pantry. I have half a jar.", seed: [], pantry: [{ name: "mayo", quantity: "0.5 jar" }], equipment: [] },
  { id: "clear-quantity", prompt: "I still have Mayo, but I don't know how much. Clear its quantity so it is unknown. Keep the same pantry item.", seed: [{ name: "Mayo", quantity: { amount: "1", unit: "jar" } }], pantry: [{ name: "mayo", quantity: "" }], equipment: [], preserveIds: true },
  { id: "consume-eggs", prompt: "I just used two eggs. Update my pantry.", seed: [{ name: "Eggs", quantity: { amount: "6", unit: "count" } }], pantry: [{ name: "eggs", quantity: "4" }], equipment: [], preserveIds: true },
  { id: "rename", prompt: "Rename Mayo to Mayonnaise in my pantry.", seed: [{ name: "Mayo" }], pantry: [{ name: "mayonnaise", quantity: "" }], equipment: [], preserveIds: true },
  { id: "equipment", prompt: "Add a skillet to my kitchen equipment.", seed: [], pantry: [], equipment: [{ name: "skillet", kind: "cookware" }] },
  { id: "multi-add", prompt: "Add Rice and Cumin to my pantry. I don't know their quantities.", seed: [], pantry: [{ name: "cumin", quantity: "" }, { name: "rice", quantity: "" }], equipment: [] },
  { id: "planning-no-write", prompt: "What could I cook with my eggs? Just suggest an idea; I have not cooked anything yet.", seed: [{ name: "Eggs", quantity: { amount: "6", unit: "count" } }], pantry: [{ name: "eggs", quantity: "6" }], equipment: [], forbidWrites: true, preserveIds: true },
  { id: "text-quantity", prompt: "Add Rice. The quantity should say 'a little left' because I can't measure it. Don't invent a number.", seed: [], pantry: [{ name: "rice", quantity: "a little left" }], equipment: [] },
];
