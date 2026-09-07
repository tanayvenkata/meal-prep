export type PantryExpectation = { name: string; quantity: string };
export type Scenario = {
  id: string;
  prompt: string;
  followUps?: string[];
  maxModelRequests?: number;
  checkpoints?: Array<{ pantry: PantryExpectation[]; equipment?: Array<{ name: string; kind: string }>; forbidWrites?: boolean }>;
  seed: Array<{ name: string; quantity?: { amount: string; unit: string } }>;
  pantry: PantryExpectation[];
  equipment: Array<{ name: string; kind: string }>;
  forbidWrites?: boolean;
  preserveIds?: boolean;
  fault?: "lose_add_response" | "create_unavailable";
  expectedOutcome?: "safe_failure";
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

export const recoveryScenarios: Scenario[] = [
  { id: "lost-add-response", prompt: "i have mayo pls add", seed: [], pantry: [{ name: "mayo", quantity: "" }], equipment: [], fault: "lose_add_response" },
  { id: "unavailable-add", prompt: "i have mayo pls add", seed: [], pantry: [{ name: "mayo", quantity: "" }], equipment: [], fault: "create_unavailable", expectedOutcome: "safe_failure" },
];

// First-run validation prompts, registered before observing their results.
// Once used for tuning, these must no longer be described as held out.
export const validationScenarios: Scenario[] = [
  { id: "validation-spice", prompt: "Found smoked paprika in the cupboard. Save that spice; no idea how much is left.", seed: [], pantry: [{ name: "smoked paprika", quantity: "" }], equipment: [] },
  { id: "validation-consume", prompt: "Breakfast is done: I used 3 of the 8 eggs we had. Please record that.", seed: [{ name: "Eggs", quantity: { amount: "8", unit: "count" } }], pantry: [{ name: "eggs", quantity: "5" }], equipment: [], preserveIds: true },
  { id: "validation-planning", prompt: "If I made an omelette tomorrow, would I have enough eggs for two? I'm only planning, so leave my inventory as it is.", seed: [{ name: "Eggs", quantity: { amount: "4", unit: "count" } }], pantry: [{ name: "eggs", quantity: "4" }], equipment: [], preserveIds: true, forbidWrites: true },
  { id: "validation-lost-response", prompt: "Please put Dijon mustard on my pantry inventory. Leave the amount unspecified.", seed: [], pantry: [{ name: "dijon mustard", quantity: "" }], equipment: [], fault: "lose_add_response" },
];

// Everyday purchase/removal cases prompted by user workflow feedback. Registered
// before the first run; keep older results tied to their original definitions.
export const everydayScenarios: Scenario[] = [
  { id: "everyday-finished", prompt: "We finished the eggs. Update my pantry.", seed: [{ name: "Eggs", quantity: { amount: "4", unit: "count" } }, { name: "Rice", quantity: { amount: "2", unit: "bag" } }], pantry: [{ name: "rice", quantity: "2 bag" }], equipment: [] },
  { id: "everyday-purchase-more", prompt: "Bought 12 more eggs. Add them to what I have.", seed: [{ name: "Eggs", quantity: { amount: "4", unit: "count" } }], pantry: [{ name: "eggs", quantity: "16" }], equipment: [], preserveIds: true },
  { id: "everyday-correct-total", prompt: "Just counted: I have 12 eggs now. Update that.", seed: [{ name: "Eggs", quantity: { amount: "4", unit: "count" } }], pantry: [{ name: "eggs", quantity: "12" }], equipment: [], preserveIds: true },
  { id: "everyday-remove", prompt: "Remove mayo from my pantry.", seed: [{ name: "Mayo" }, { name: "Rice", quantity: { amount: "2", unit: "bag" } }], pantry: [{ name: "rice", quantity: "2 bag" }], equipment: [] },
  { id: "everyday-remove-absent", prompt: "Remove mayo from my pantry.", seed: [{ name: "Rice", quantity: { amount: "2", unit: "bag" } }], pantry: [{ name: "rice", quantity: "2 bag" }], equipment: [], preserveIds: true },
  { id: "everyday-new-purchase", prompt: "Bought 12 eggs. Add them to the pantry.", seed: [], pantry: [{ name: "eggs", quantity: "12" }], equipment: [] },
  { id: "everyday-purchase-again", prompt: "We ran out of eggs earlier, but I just bought six. Save them.", seed: [{ name: "Eggs", quantity: { amount: "0", unit: "count" } }], pantry: [{ name: "eggs", quantity: "6" }], equipment: [], preserveIds: true },
];

// Scripted user follow-ups are supplied after an assistant answer, not generated
// by a model. Intermediate state is checked before supplying the next message.
export const dialogueScenarios: Scenario[] = [
  { id: "dialogue-purchase-amount", prompt: "Bought more eggs. Update my pantry.", followUps: ["Twelve more eggs."], seed: [{ name: "Eggs", quantity: { amount: "4", unit: "count" } }], checkpoints: [{ pantry: [{ name: "eggs", quantity: "4" }], forbidWrites: true }, { pantry: [{ name: "eggs", quantity: "16" }] }], pantry: [{ name: "eggs", quantity: "16" }], equipment: [], preserveIds: true },
  { id: "dialogue-correct-total", prompt: "I counted 12 eggs. Update the total.", followUps: ["Actually, ten eggs total. I miscounted."], seed: [{ name: "Eggs", quantity: { amount: "4", unit: "count" } }], checkpoints: [{ pantry: [{ name: "eggs", quantity: "12" }] }, { pantry: [{ name: "eggs", quantity: "10" }] }], pantry: [{ name: "eggs", quantity: "10" }], equipment: [], preserveIds: true },
  { id: "dialogue-distinct-purchases", prompt: "Bought six more eggs. Add them.", followUps: ["I made another trip and bought another six eggs. Add those too."], seed: [{ name: "Eggs", quantity: { amount: "4", unit: "count" } }], checkpoints: [{ pantry: [{ name: "eggs", quantity: "10" }] }, { pantry: [{ name: "eggs", quantity: "16" }] }], pantry: [{ name: "eggs", quantity: "16" }], equipment: [], preserveIds: true },
];

// Registered after the first surface pair, before running either surface on these
// prompts. Judge final effects, not a prescribed tool sequence. Once inspected
// for tuning, this set is a regression set rather than fresh validation evidence.
export const compositionScenarios: Scenario[] = [
  { id: "composition-grocery-trip", prompt: "Back from shopping: bought six more eggs and some cumin, no idea how much cumin. We finished the rice. Update my pantry with all of that.", seed: [{ name: "Eggs", quantity: { amount: "4", unit: "count" } }, { name: "Rice", quantity: { amount: "1", unit: "bag" } }], pantry: [{ name: "cumin", quantity: "" }, { name: "eggs", quantity: "10" }], equipment: [] },
  { id: "composition-correction-remove", prompt: "Correct the eggs to 10 total, and remove the mayo. Leave the rice alone.", seed: [{ name: "Eggs", quantity: { amount: "4", unit: "count" } }, { name: "Mayo" }, { name: "Rice", quantity: { amount: "2", unit: "bag" } }], pantry: [{ name: "eggs", quantity: "10" }, { name: "rice", quantity: "2 bag" }], equipment: [] },
  { id: "composition-cooking-use", prompt: "I cooked breakfast and used three eggs. We also finished the cumin. Record that, please.", seed: [{ name: "Eggs", quantity: { amount: "8", unit: "count" } }, { name: "Cumin" }], pantry: [{ name: "eggs", quantity: "5" }], equipment: [] },
  { id: "composition-equipment-lifecycle", maxModelRequests: 18, prompt: "Add a skillet to my kitchen equipment.", followUps: ["Rename that skillet to Cast iron skillet.", "I gave that skillet away. Remove it from my kitchen equipment."], seed: [], checkpoints: [{ pantry: [], equipment: [{ name: "skillet", kind: "cookware" }] }, { pantry: [], equipment: [{ name: "cast iron skillet", kind: "cookware" }] }, { pantry: [], equipment: [] }], pantry: [], equipment: [] },
  { id: "composition-proposal-only", prompt: "I'm considering buying six eggs and cumin, and throwing away the mayo. Show me what those changes would mean, but don't save any changes yet.", seed: [{ name: "Eggs", quantity: { amount: "4", unit: "count" } }, { name: "Mayo" }], pantry: [{ name: "eggs", quantity: "4" }, { name: "mayo", quantity: "" }], equipment: [], forbidWrites: true, preserveIds: true },
];
