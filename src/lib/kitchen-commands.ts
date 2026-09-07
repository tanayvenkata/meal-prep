// Shared handlers for the selectable four-tool MCP interface.
import { candidateInputs } from "./kitchen-command-contract";
import { getItemById, KitchenWriteRejection, lockKitchenWriteTargets, runKitchenWrite, type KitchenWriteValue } from "./db";
import { createKitchenTool, createPantryItem, updateKitchenTool, updatePantryItem, deleteKitchenTool, deletePantryItem, adjustPantryItemQuantity, type KitchenServiceResult } from "./kitchen-service";

function domainQuantity(value: { amount: string; unit: string } | { mode: "unknown" } | { mode: "text"; text: string } | undefined) {
  return value && "amount" in value ? { mode: "structured" as const, ...value } : value;
}
function publicValue(value: unknown): KitchenWriteValue {
  return JSON.parse(JSON.stringify(value, (key, entry) => {
    if (key === "user_id") return undefined;
    if (key === "id" && typeof entry === "string" && /^\d+$/.test(entry)) {
      const id = Number(entry);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("invalid_pantry_id");
      return id;
    }
    return entry;
  }));
}
function effect<T extends { status: string }>(result: KitchenServiceResult<T>, index: number): KitchenWriteValue {
  if (!result.ok) throw new KitchenWriteRejection(index, "invalid_input");
  if (!["created", "already_exists", "updated", "unchanged", "deleted", "applied"].includes(result.value.status)) {
    throw new KitchenWriteRejection(index, result.value.status);
  }
  return publicValue(result.value);
}
async function lockTargets(userId: string, items: Array<{ collection: "pantry"; id: number } | { collection: "equipment"; id: string }>) {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    const key = `${item.collection}:${item.id}`;
    if (seen.has(key)) throw new KitchenWriteRejection(index, "duplicate_target");
    seen.add(key);
  }
  await lockKitchenWriteTargets(userId,
    items.flatMap(x => x.collection === "pantry" ? [x.id] : []),
    items.flatMap(x => x.collection === "equipment" ? [x.id] : []));
}

export async function addKitchenItems(userId: string, input: unknown) {
  const parsed = candidateInputs.add_items.safeParse(input);
  if (!parsed.success) return { status: "invalid_input" as const };
  const command = parsed.data;
  return runKitchenWrite(userId, command.requestId, "add_items", publicValue(command), async () => {
    await lockTargets(userId, command.items.flatMap(item => "id" in item ? [item] : []));
    const results: KitchenWriteValue[] = [];
    for (const [index, item] of command.items.entries()) {
      if (item.collection === "pantry" && "operation" in item) {
        const current = await getItemById(userId, item.id);
        if (!current) throw new KitchenWriteRejection(index, "not_found");
        if (current.name !== item.expectedName) throw new KitchenWriteRejection(index, "conflict");
        results.push(effect(await adjustPantryItemQuantity(userId, {
          name: current.name, operation: "restock",
          expectedQuantity: domainQuantity(item.expectedQuantity), deltaQuantity: domainQuantity(item.delta),
        }), index));
        continue;
      }
      results.push(item.collection === "pantry"
        ? effect(await createPantryItem(userId, { ...item, quantity: domainQuantity(item.quantity) }), index)
        : effect(await createKitchenTool(userId, item), index));
    }
    return results;
  });
}

export async function editKitchenItems(userId: string, input: unknown) {
  const parsed = candidateInputs.edit_items.safeParse(input);
  if (!parsed.success) return { status: "invalid_input" as const };
  const command = parsed.data;
  return runKitchenWrite(userId, command.requestId, "edit_items", publicValue(command), async () => {
    await lockTargets(userId, command.items);
    const results: KitchenWriteValue[] = [];
    for (const [index, item] of command.items.entries()) {
      if (item.collection === "equipment") {
        results.push(effect(await updateKitchenTool(userId, item), index));
      } else if (item.operation === "replace") {
        results.push(effect(await updatePantryItem(userId, { ...item, quantity: domainQuantity(item.quantity) }), index));
      } else {
        const current = await getItemById(userId, item.id);
        if (!current) throw new KitchenWriteRejection(index, "not_found");
        if (current.name !== item.expectedName) throw new KitchenWriteRejection(index, "conflict");
        results.push(effect(await adjustPantryItemQuantity(userId, {
          name: current.name, operation: item.operation === "increase" ? "restock" : "consume",
          expectedQuantity: domainQuantity(item.expectedQuantity), deltaQuantity: domainQuantity(item.delta),
        }), index));
      }
    }
    return results;
  });
}

export async function removeKitchenItems(userId: string, input: unknown) {
  const parsed = candidateInputs.remove_items.safeParse(input);
  if (!parsed.success) return { status: "invalid_input" as const };
  const command = parsed.data;
  return runKitchenWrite(userId, command.requestId, "remove_items", publicValue(command), async () => {
    await lockTargets(userId, command.items);
    const results: KitchenWriteValue[] = [];
    for (const [index, item] of command.items.entries()) {
      results.push(item.collection === "pantry"
        ? effect(await deletePantryItem(userId, item), index)
        : effect(await deleteKitchenTool(userId, item), index));
    }
    return results;
  });
}
