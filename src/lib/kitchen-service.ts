// Server-only domain service. Trusted HTTP/MCP transports resolve user identity
// before calling it; browser components never import this module.
import {
  addItem,
  addKitchenTool,
  deleteItem as deleteItemRecord,
  deleteKitchenTool as deleteKitchenToolRecord,
  getItemByCanonicalName,
  getItemById,
  getItems,
  getKitchenTools,
  setItemQuantityByCanonicalName,
  updateItem as updateItemRecord,
  updateKitchenTool as updateKitchenToolRecord,
  type Item,
  type KitchenTool,
  type Turnover,
} from "@/lib/db";
import {
  pantryQuantityMatchesStoredFields,
  parsePantryQuantity,
  UNKNOWN_PANTRY_QUANTITY,
  type PantryQuantity,
} from "@/lib/pantry-quantity";

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

export type SetPantryItemQuantityInput = {
  name?: unknown;
  quantity?: unknown;
};

export type SetPantryItemQuantityOutcome =
  | {
      status: "updated" | "unchanged";
      name: string;
      beforeQuantity: string;
      quantity: string;
    }
  | {
      status: "not_found";
      name: string;
    };

export type CreatePantryItemOutcome =
  | { status: "created"; item: Item }
  | { status: "already_exists"; item: Item };

export type UpdatePantryItemOutcome =
  | { status: "updated" | "unchanged"; item: Item }
  | { status: "not_found"; id: number }
  | { status: "name_conflict"; id: number; conflictingItem: Item };

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

function normalizeOptionalQuantity(
  value: unknown,
): KitchenServiceResult<PantryQuantity | undefined> {
  if (value === undefined) return valid(undefined);
  const result = parsePantryQuantity(value);
  return result.ok ? valid(result.value) : invalid(result.error);
}

function normalizeRequiredQuantity(
  value: unknown,
): KitchenServiceResult<PantryQuantity> {
  if (typeof value !== "string" || value.trim() === "") {
    return invalid("quantity is required");
  }

  const result = parsePantryQuantity(value);
  return result.ok ? valid(result.value) : invalid(result.error);
}

function normalizePantryItemId(value: unknown): KitchenServiceResult<number> {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value <= 0
  ) {
    return invalid("id must be a positive integer");
  }
  return valid(value);
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
): Promise<KitchenServiceResult<CreatePantryItemOutcome>> {
  const name = normalizeRequiredText(input.name, "name", MAX_ITEM_NAME_LENGTH);
  if (!name.ok) return name;

  const quantity = normalizeOptionalQuantity(input.quantity);
  if (!quantity.ok) return quantity;

  const turnover = normalizeTurnover(input.turnover ?? "high");
  if (!turnover.ok) return turnover;

  const result = await addItem(
    userId,
    name.value,
    quantity.value ?? UNKNOWN_PANTRY_QUANTITY,
    turnover.value,
  );
  return valid(result);
}

export async function updatePantryItem(
  userId: string,
  input: UpdatePantryItemInput,
): Promise<KitchenServiceResult<UpdatePantryItemOutcome>> {
  const id = normalizePantryItemId(input.id);
  if (!id.ok) return id;

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

  const quantity = normalizeOptionalQuantity(input.quantity);
  if (!quantity.ok) return quantity;

  let turnover: Turnover | undefined;
  if (input.turnover !== undefined && input.turnover !== null) {
    const normalized = normalizeTurnover(input.turnover);
    if (!normalized.ok) return normalized;
    turnover = normalized.value;
  }

  const current = await getItemById(userId, id.value);
  if (!current) {
    return valid({ status: "not_found", id: id.value });
  }

  if (name !== undefined) {
    const conflictingItem = await getItemByCanonicalName(
      userId,
      name,
    );
    if (conflictingItem && conflictingItem.id !== current.id) {
      return valid({
        status: "name_conflict",
        id: id.value,
        conflictingItem,
      });
    }
  }

  const nameChanged = name !== undefined && name !== current.name;
  const quantityChanged = quantity.value !== undefined
    && !pantryQuantityMatchesStoredFields(quantity.value, current);
  const turnoverChanged = turnover !== undefined && turnover !== current.turnover;
  if (
    !nameChanged
    && !quantityChanged
    && !turnoverChanged
  ) {
    return valid({ status: "unchanged", item: current });
  }

  const result = await updateItemRecord(
    userId,
    id.value,
    {
      ...(nameChanged ? { name } : {}),
      ...(quantityChanged ? { quantity: quantity.value } : {}),
      ...(turnoverChanged ? { turnover } : {}),
    },
  );
  if (result.status === "not_found") {
    return valid({ status: "not_found", id: id.value });
  }
  if (result.status === "name_conflict") {
    const conflictingItem = name === undefined
      ? null
      : await getItemByCanonicalName(userId, name);
    if (!conflictingItem) {
      throw new Error("pantry name conflict disappeared before lookup");
    }
    return valid({
      status: "name_conflict",
      id: id.value,
      conflictingItem,
    });
  }
  return valid({ status: "updated", item: result.item });
}

export async function deletePantryItem(
  userId: string,
  input: PantryItemIdInput,
): Promise<KitchenServiceResult<null>> {
  const id = normalizePantryItemId(input.id);
  if (!id.ok) return id;

  await deleteItemRecord(userId, id.value);
  return valid(null);
}

export async function setPantryItemQuantity(
  userId: string,
  input: SetPantryItemQuantityInput,
): Promise<KitchenServiceResult<SetPantryItemQuantityOutcome>> {
  const name = normalizeRequiredText(
    input.name,
    "name",
    MAX_ITEM_NAME_LENGTH,
  );
  if (!name.ok) return name;

  const quantity = normalizeRequiredQuantity(input.quantity);
  if (!quantity.ok) return quantity;

  const updated = await setItemQuantityByCanonicalName(
    userId,
    name.value,
    quantity.value,
  );
  if (updated.status === "not_found") {
    return valid({ status: "not_found", name: name.value });
  }

  return valid({
    status: updated.status,
    name: updated.item.name,
    beforeQuantity: updated.beforeQuantity,
    quantity: updated.item.quantity,
  });
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
