// Server-only domain service. Trusted HTTP/MCP transports resolve user identity
// before calling it; browser components never import this module.
import {
  addItem,
  addKitchenTool,
  deleteItem as deleteItemRecord,
  deleteKitchenTool as deleteKitchenToolRecord,
  getItems,
  getKitchenTools,
  updateItem as updateItemRecord,
  updateKitchenTool as updateKitchenToolRecord,
  type Item,
  type KitchenTool,
  type Turnover,
} from "@/lib/db";

const MAX_ITEM_NAME_LENGTH = 100;
const MAX_TOOL_NAME_LENGTH = 100;
const MAX_TOOL_KIND_LENGTH = 50;

export type KitchenServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type CreatePantryItemInput = {
  name?: unknown;
  quantity?: unknown;
  turnover?: unknown;
};

export type UpdatePantryItemInput = {
  id?: unknown;
  name?: unknown;
  quantity?: unknown;
  turnover?: unknown;
};

export type PantryItemIdInput = {
  id?: unknown;
};

export type KitchenToolInput = {
  name?: unknown;
  kind?: unknown;
};

export type UpdateKitchenToolInput = KitchenToolInput & {
  id?: unknown;
};

export type KitchenToolIdInput = {
  id?: unknown;
};

function invalid(error: string): KitchenServiceResult<never> {
  return { ok: false, error };
}

function valid<T>(value: T): KitchenServiceResult<T> {
  return { ok: true, value };
}

function normalizeRequiredText(
  value: unknown,
  field: "name" | "kind",
  maxLength: number,
): KitchenServiceResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return invalid(`${field} is required`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return invalid(`${field} must be ${maxLength} characters or fewer`);
  }

  return valid(trimmed);
}

function normalizeQuantity(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new TypeError("quantity must be a string");
  }
  return value.trim();
}

function normalizeTurnover(value: unknown): KitchenServiceResult<Turnover> {
  if (value === "high" || value === "low") return valid(value);
  return invalid("turnover must be high or low");
}

export async function listPantryItems(userId: string): Promise<Item[]> {
  return getItems(userId);
}

export async function createPantryItem(
  userId: string,
  input: CreatePantryItemInput,
): Promise<KitchenServiceResult<Item>> {
  const name = normalizeRequiredText(input.name, "name", MAX_ITEM_NAME_LENGTH);
  if (!name.ok) return name;

  const turnover = normalizeTurnover(input.turnover ?? "high");
  if (!turnover.ok) return turnover;

  const item = await addItem(
    userId,
    name.value,
    normalizeQuantity(input.quantity),
    turnover.value,
  );
  return valid(item);
}

export async function updatePantryItem(
  userId: string,
  input: UpdatePantryItemInput,
): Promise<KitchenServiceResult<Item>> {
  if (!input.id) return invalid("id is required");

  let name: string | undefined;
  if (input.name !== undefined && input.name !== null) {
    const normalized = normalizeRequiredText(
      input.name,
      "name",
      MAX_ITEM_NAME_LENGTH,
    );
    if (!normalized.ok) return normalized;
    name = normalized.value;
  }

  let turnover: Turnover | undefined;
  if (input.turnover !== undefined && input.turnover !== null) {
    const normalized = normalizeTurnover(input.turnover);
    if (!normalized.ok) return normalized;
    turnover = normalized.value;
  }

  const item = await updateItemRecord(
    userId,
    input.id as number,
    normalizeQuantity(input.quantity),
    name,
    turnover,
  );
  return valid(item);
}

export async function deletePantryItem(
  userId: string,
  input: PantryItemIdInput,
): Promise<KitchenServiceResult<null>> {
  if (!input.id) return invalid("id is required");

  await deleteItemRecord(userId, input.id as number);
  return valid(null);
}

export async function listKitchenTools(userId: string): Promise<KitchenTool[]> {
  return getKitchenTools(userId);
}

export async function createKitchenTool(
  userId: string,
  input: KitchenToolInput,
): Promise<KitchenServiceResult<KitchenTool>> {
  const name = normalizeRequiredText(
    input.name,
    "name",
    MAX_TOOL_NAME_LENGTH,
  );
  if (!name.ok) return name;

  const kind = normalizeRequiredText(
    input.kind,
    "kind",
    MAX_TOOL_KIND_LENGTH,
  );
  if (!kind.ok) return kind;

  const tool = await addKitchenTool(userId, name.value, kind.value);
  return valid(tool);
}

export async function updateKitchenTool(
  userId: string,
  input: UpdateKitchenToolInput,
): Promise<KitchenServiceResult<KitchenTool>> {
  if (typeof input.id !== "string" || input.id === "") {
    return invalid("id is required");
  }

  const name = normalizeRequiredText(
    input.name,
    "name",
    MAX_TOOL_NAME_LENGTH,
  );
  if (!name.ok) return name;

  const kind = normalizeRequiredText(
    input.kind,
    "kind",
    MAX_TOOL_KIND_LENGTH,
  );
  if (!kind.ok) return kind;

  const tool = await updateKitchenToolRecord(
    userId,
    input.id,
    name.value,
    kind.value,
  );
  return valid(tool);
}

export async function deleteKitchenTool(
  userId: string,
  input: KitchenToolIdInput,
): Promise<KitchenServiceResult<null>> {
  if (typeof input.id !== "string" || input.id === "") {
    return invalid("id is required");
  }

  await deleteKitchenToolRecord(userId, input.id);
  return valid(null);
}

export async function getKitchenContext(userId: string) {
  const [items, tools] = await Promise.all([
    listPantryItems(userId),
    listKitchenTools(userId),
  ]);

  return {
    pantry: items.map(({ name, quantity, turnover }) => ({
      name,
      quantity,
      turnover,
    })),
    tools: tools.map(({ name, kind }) => ({ name, kind })),
  };
}
