// Server-only domain service. Trusted HTTP/MCP transports resolve user identity
// before calling it; browser components never import this module.
import {
  applyReviewedReceiptImport as applyReviewedReceiptImportRecord,
  adjustItemQuantitiesByCanonicalName,
  adjustItemQuantityByCanonicalName,
  addItem,
  addKitchenTool,
  deleteItem as deleteItemRecord,
  deleteItems as deleteItemsRecords,
  deleteKitchenTool as deleteKitchenToolRecord,
  getItemByCanonicalName,
  getItemById,
  getItems,
  getKitchenToolByCanonicalName,
  getKitchenToolById,
  getKitchenTools,
  setItemQuantityByCanonicalName,
  updateItem as updateItemRecord,
  updateKitchenTool as updateKitchenToolRecord,
  type Item,
  type KitchenTool,
  type KitchenToolKind,
  type ReviewedReceiptImportResult,
  type Turnover,
} from "@/lib/db";
import {
  isPantryQuantityUnit,
  isPositiveStructuredPantryQuantity,
  pantryQuantityMatchesStoredFields,
  parsePantryQuantity,
  UNKNOWN_PANTRY_QUANTITY,
  type PantryQuantity,
  type PantryQuantityAdjustmentOperation,
  type StructuredPantryQuantity,
} from "@/lib/pantry-quantity";

const MAX_ITEM_NAME_LENGTH = 100;
const MAX_TOOL_NAME_LENGTH = 100;
const MAX_PANTRY_ADJUSTMENT_BATCH_SIZE = 25;
const MAX_PANTRY_DELETE_BATCH_SIZE = 100;

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

export type PantryItemIdsInput = {
  ids?: unknown;
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

export type AdjustPantryItemQuantityInput = {
  name?: unknown;
  operation?: unknown;
  expectedQuantity?: unknown;
  deltaQuantity?: unknown;
};

export type AdjustPantryItemQuantityBatchInput = {
  changes?: unknown;
};

export type ApplyReviewedReceiptImportInput = {
  requestId?: unknown;
  lines?: unknown;
};

export type AdjustPantryItemQuantityOutcome =
  | {
      status: "applied";
      operation: PantryQuantityAdjustmentOperation;
      name: string;
      beforeQuantity: string;
      quantity: string;
      before: StructuredPantryQuantity;
      delta: StructuredPantryQuantity;
      after: StructuredPantryQuantity;
    }
  | { status: "not_found"; name: string }
  | {
      status: "unsupported_quantity";
      name: string;
      currentQuantity: string;
    }
  | {
      status: "conflict";
      name: string;
      expected: StructuredPantryQuantity;
      current: StructuredPantryQuantity;
    }
  | {
      status: "unit_mismatch";
      name: string;
      expectedUnit: StructuredPantryQuantity["unit"];
      deltaUnit: StructuredPantryQuantity["unit"];
    }
  | {
      status: "insufficient_quantity" | "amount_exceeded";
      name: string;
      current: StructuredPantryQuantity;
      delta: StructuredPantryQuantity;
    };

export type AdjustPantryItemQuantityBatchOutcome =
  | {
      status: "applied";
      changes: Array<{
        index: number;
        operation: PantryQuantityAdjustmentOperation;
        name: string;
        beforeQuantity: string;
        quantity: string;
        before: StructuredPantryQuantity;
        delta: StructuredPantryQuantity;
        after: StructuredPantryQuantity;
      }>;
    }
  | {
      status: "rejected";
      failures: Array<
        | {
            index: number;
            name: string;
            status: "duplicate_target";
            duplicateIndexes: number[];
          }
        | { index: number; name: string; status: "not_found" }
        | {
            index: number;
            name: string;
            status: "unsupported_quantity";
            currentQuantity: string;
          }
        | {
            index: number;
            name: string;
            status: "conflict";
            expected: StructuredPantryQuantity;
            current: StructuredPantryQuantity;
          }
        | {
            index: number;
            name: string;
            status: "unit_mismatch";
            expectedUnit: StructuredPantryQuantity["unit"];
            deltaUnit: StructuredPantryQuantity["unit"];
          }
        | {
            index: number;
            name: string;
            status: "insufficient_quantity" | "amount_exceeded";
            current: StructuredPantryQuantity;
            delta: StructuredPantryQuantity;
          }
      >;
    };

export type ApplyReviewedReceiptImportOutcome = ReviewedReceiptImportResult;

export type CreatePantryItemOutcome =
  | { status: "created"; item: Item }
  | { status: "already_exists"; item: Item };

export type UpdatePantryItemOutcome =
  | { status: "updated" | "unchanged"; item: Item }
  | { status: "not_found"; id: number }
  | { status: "name_conflict"; id: number; conflictingItem: Item };

export type DeletePantryItemsOutcome =
  | { status: "deleted"; ids: number[] }
  | { status: "not_found"; ids: number[] };

export type CreateKitchenToolOutcome =
  | { status: "created"; tool: KitchenTool }
  | { status: "already_exists"; tool: KitchenTool };

export type UpdateKitchenToolOutcome =
  | { status: "updated" | "unchanged"; tool: KitchenTool }
  | { status: "not_found"; id: string }
  | { status: "name_conflict"; id: string; conflictingTool: KitchenTool };

export type DeleteKitchenToolOutcome =
  | { status: "deleted"; id: string }
  | { status: "not_found"; id: string };

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

export type KitchenContext = {
  pantry: Array<{
    name: string;
    quantity: string;
    turnover: Turnover;
    quantityMode: "unknown" | "text" | "structured" | "unsupported";
    quantityAmount: string | null;
    quantityUnit: string | null;
  }>;
  tools: Array<{ name: string; kind: string }>;
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

function normalizeRequiredStructuredQuantity(
  value: unknown,
  field: "quantity" | "expected quantity" | "delta quantity",
): KitchenServiceResult<StructuredPantryQuantity> {
  const quantity = normalizeRequiredQuantity(value);
  if (!quantity.ok) return quantity;
  if (quantity.value.mode !== "structured") {
    return invalid(
      `${field} must include a recognized unit, such as 2 count or 0.5 lb`,
    );
  }
  return valid(quantity.value);
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

function normalizeRequestId(value: unknown): KitchenServiceResult<string> {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  ) {
    return invalid("requestId must be a UUID");
  }
  return valid(value.toLowerCase());
}

function normalizeUuid(
  value: unknown,
  field: "id",
): KitchenServiceResult<string> {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value)
  ) {
    return invalid(`${field} must be a UUID`);
  }
  return valid(value.toLowerCase());
}

function normalizeKitchenToolKind(
  value: unknown,
): KitchenServiceResult<KitchenToolKind> {
  if (typeof value !== "string") {
    return invalid("kind is required");
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "appliance"
    || normalized === "cookware"
    || normalized === "bakeware"
  ) {
    return valid(normalized);
  }
  return invalid("kind must be appliance, cookware, or bakeware");
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

export async function deletePantryItems(
  userId: string,
  input: PantryItemIdsInput,
): Promise<KitchenServiceResult<DeletePantryItemsOutcome>> {
  if (!Array.isArray(input.ids)) {
    return invalid("ids must be an array");
  }
  if (input.ids.length < 2) {
    return invalid("select at least two pantry items");
  }
  if (input.ids.length > MAX_PANTRY_DELETE_BATCH_SIZE) {
    return invalid(
      `ids must contain ${MAX_PANTRY_DELETE_BATCH_SIZE} items or fewer`,
    );
  }

  const ids: number[] = [];
  for (const value of input.ids) {
    const id = normalizePantryItemId(value);
    if (!id.ok) return invalid("every id must be a positive integer");
    ids.push(id.value);
  }
  if (new Set(ids).size !== ids.length) {
    return invalid("ids must not contain duplicates");
  }

  return valid(await deleteItemsRecords(userId, ids));
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

export async function adjustPantryItemQuantity(
  userId: string,
  input: AdjustPantryItemQuantityInput,
): Promise<KitchenServiceResult<AdjustPantryItemQuantityOutcome>> {
  const name = normalizeRequiredText(
    input.name,
    "name",
    MAX_ITEM_NAME_LENGTH,
  );
  if (!name.ok) return name;

  if (input.operation !== "consume" && input.operation !== "restock") {
    return invalid("operation must be consume or restock");
  }

  const expected = normalizeRequiredStructuredQuantity(
    input.expectedQuantity,
    "expected quantity",
  );
  if (!expected.ok) return expected;

  const delta = normalizeRequiredStructuredQuantity(
    input.deltaQuantity,
    "delta quantity",
  );
  if (!delta.ok) return delta;
  if (!isPositiveStructuredPantryQuantity(delta.value)) {
    return invalid("delta quantity must be greater than zero");
  }

  if (expected.value.unit !== delta.value.unit) {
    return valid({
      status: "unit_mismatch",
      name: name.value,
      expectedUnit: expected.value.unit,
      deltaUnit: delta.value.unit,
    });
  }

  const result = await adjustItemQuantityByCanonicalName(
    userId,
    name.value,
    input.operation,
    expected.value,
    delta.value,
  );
  switch (result.status) {
    case "not_found":
      return valid({ status: "not_found", name: name.value });
    case "unsupported_quantity":
      return valid({
        status: "unsupported_quantity",
        name: name.value,
        currentQuantity: result.currentDisplay,
      });
    case "conflict":
      return valid({
        status: "conflict",
        name: name.value,
        expected: expected.value,
        current: result.current,
      });
    case "unit_mismatch":
      return valid({
        status: "unit_mismatch",
        name: name.value,
        expectedUnit: result.expectedUnit,
        deltaUnit: result.deltaUnit,
      });
    case "insufficient_quantity":
    case "amount_exceeded":
      return valid({
        status: result.status,
        name: name.value,
        current: result.current,
        delta: result.delta,
      });
    case "applied":
      return valid({
        status: "applied",
        operation: input.operation,
        name: result.item.name,
        beforeQuantity: result.beforeQuantity,
        quantity: result.afterQuantity,
        before: result.before,
        delta: delta.value,
        after: result.after,
      });
  }
}

export async function adjustPantryItemQuantities(
  userId: string,
  input: AdjustPantryItemQuantityBatchInput,
): Promise<KitchenServiceResult<AdjustPantryItemQuantityBatchOutcome>> {
  if (!Array.isArray(input.changes)) {
    return invalid("changes must be an array");
  }
  if (input.changes.length === 0) {
    return invalid("changes must include at least one item");
  }
  if (input.changes.length > MAX_PANTRY_ADJUSTMENT_BATCH_SIZE) {
    return invalid(
      `changes must include ${MAX_PANTRY_ADJUSTMENT_BATCH_SIZE} items or fewer`,
    );
  }

  const normalizedChanges: Array<{
    name: string;
    operation: PantryQuantityAdjustmentOperation;
    expected: StructuredPantryQuantity;
    delta: StructuredPantryQuantity;
  }> = [];

  for (const [index, rawChange] of input.changes.entries()) {
    if (
      typeof rawChange !== "object"
      || rawChange === null
      || Array.isArray(rawChange)
    ) {
      return invalid(`changes[${index}] must be an object`);
    }
    const change = rawChange as Record<string, unknown>;

    const name = normalizeRequiredText(
      change.name,
      "name",
      MAX_ITEM_NAME_LENGTH,
    );
    if (!name.ok) return invalid(`changes[${index}].${name.error}`);

    if (change.operation !== "consume" && change.operation !== "restock") {
      return invalid(
        `changes[${index}].operation must be consume or restock`,
      );
    }

    const expected = normalizeRequiredStructuredQuantity(
      change.expectedQuantity,
      "expected quantity",
    );
    if (!expected.ok) {
      return invalid(`changes[${index}].${expected.error}`);
    }

    const delta = normalizeRequiredStructuredQuantity(
      change.deltaQuantity,
      "delta quantity",
    );
    if (!delta.ok) return invalid(`changes[${index}].${delta.error}`);
    if (!isPositiveStructuredPantryQuantity(delta.value)) {
      return invalid(
        `changes[${index}].delta quantity must be greater than zero`,
      );
    }

    normalizedChanges.push({
      name: name.value,
      operation: change.operation,
      expected: expected.value,
      delta: delta.value,
    });
  }

  const result = await adjustItemQuantitiesByCanonicalName(
    userId,
    normalizedChanges,
  );
  if (result.status === "applied") {
    return valid({
      status: "applied",
      changes: result.changes.map((change) => ({
        index: change.index,
        operation: change.operation,
        name: change.item.name,
        beforeQuantity: change.beforeQuantity,
        quantity: change.afterQuantity,
        before: change.before,
        delta: change.delta,
        after: change.after,
      })),
    });
  }

  return valid({
    status: "rejected",
    failures: result.failures.map((failure) => {
      switch (failure.status) {
        case "unsupported_quantity":
          return {
            index: failure.index,
            name: failure.name,
            status: failure.status,
            currentQuantity: failure.currentDisplay,
          };
        case "conflict":
          return {
            index: failure.index,
            name: failure.name,
            status: failure.status,
            expected: normalizedChanges[failure.index].expected,
            current: failure.current,
          };
        default:
          return failure;
      }
    }),
  });
}

export async function applyReviewedReceiptImport(
  userId: string,
  input: ApplyReviewedReceiptImportInput,
): Promise<KitchenServiceResult<ApplyReviewedReceiptImportOutcome>> {
  const requestId = normalizeRequestId(input.requestId);
  if (!requestId.ok) return requestId;

  if (!Array.isArray(input.lines)) {
    return invalid("lines must be an array");
  }
  if (input.lines.length === 0) {
    return invalid("lines must include at least one item");
  }
  if (input.lines.length > MAX_PANTRY_ADJUSTMENT_BATCH_SIZE) {
    return invalid(
      `lines must include ${MAX_PANTRY_ADJUSTMENT_BATCH_SIZE} items or fewer`,
    );
  }

  const normalizedLines: Parameters<
    typeof applyReviewedReceiptImportRecord
  >[2] = [];
  for (const [index, rawLine] of input.lines.entries()) {
    if (
      typeof rawLine !== "object"
      || rawLine === null
      || Array.isArray(rawLine)
    ) {
      return invalid(`lines[${index}] must be an object`);
    }
    const line = rawLine as Record<string, unknown>;
    const name = normalizeRequiredText(
      line.name,
      "name",
      MAX_ITEM_NAME_LENGTH,
    );
    if (!name.ok) return invalid(`lines[${index}].${name.error}`);

    if (line.decision === "create") {
      const quantity = normalizeRequiredStructuredQuantity(
        line.quantity,
        "quantity",
      );
      if (!quantity.ok) {
        return invalid(`lines[${index}].${quantity.error}`);
      }
      if (!isPositiveStructuredPantryQuantity(quantity.value)) {
        return invalid(
          `lines[${index}].quantity must be greater than zero`,
        );
      }
      const turnover = normalizeTurnover(line.turnover ?? "high");
      if (!turnover.ok) {
        return invalid(`lines[${index}].${turnover.error}`);
      }
      normalizedLines.push({
        decision: line.decision,
        name: name.value,
        quantity: quantity.value,
        turnover: turnover.value,
      });
      continue;
    }

    if (line.decision === "restock") {
      const expected = normalizeRequiredStructuredQuantity(
        line.expectedQuantity,
        "expected quantity",
      );
      if (!expected.ok) {
        return invalid(`lines[${index}].${expected.error}`);
      }
      const delta = normalizeRequiredStructuredQuantity(
        line.deltaQuantity,
        "delta quantity",
      );
      if (!delta.ok) {
        return invalid(`lines[${index}].${delta.error}`);
      }
      if (!isPositiveStructuredPantryQuantity(delta.value)) {
        return invalid(
          `lines[${index}].delta quantity must be greater than zero`,
        );
      }
      normalizedLines.push({
        decision: line.decision,
        name: name.value,
        expected: expected.value,
        delta: delta.value,
      });
      continue;
    }

    return invalid(`lines[${index}].decision must be create or restock`);
  }

  const result = await applyReviewedReceiptImportRecord(
    userId,
    requestId.value,
    normalizedLines,
  );
  return valid(result);
}

export async function listKitchenTools(userId: string): Promise<KitchenTool[]> {
  return getKitchenTools(userId);
}

export async function createKitchenTool(
  userId: string,
  input: KitchenToolInput,
): Promise<KitchenServiceResult<CreateKitchenToolOutcome>> {
  const name = normalizeRequiredText(
    input.name,
    "name",
    MAX_TOOL_NAME_LENGTH,
  );
  if (!name.ok) return name;

  const kind = normalizeKitchenToolKind(input.kind);
  if (!kind.ok) return kind;

  return valid(await addKitchenTool(userId, name.value, kind.value));
}

export async function updateKitchenTool(
  userId: string,
  input: UpdateKitchenToolInput,
): Promise<KitchenServiceResult<UpdateKitchenToolOutcome>> {
  const id = normalizeUuid(input.id, "id");
  if (!id.ok) return id;

  const name = normalizeRequiredText(
    input.name,
    "name",
    MAX_TOOL_NAME_LENGTH,
  );
  if (!name.ok) return name;

  const kind = normalizeKitchenToolKind(input.kind);
  if (!kind.ok) return kind;

  const current = await getKitchenToolById(userId, id.value);
  if (!current) {
    return valid({ status: "not_found", id: id.value });
  }

  const conflictingTool = await getKitchenToolByCanonicalName(
    userId,
    name.value,
  );
  if (conflictingTool && conflictingTool.id !== current.id) {
    return valid({
      status: "name_conflict",
      id: id.value,
      conflictingTool,
    });
  }

  const keepsCanonicalIdentity = conflictingTool?.id === current.id;
  if (keepsCanonicalIdentity && kind.value === current.kind) {
    return valid({ status: "unchanged", tool: current });
  }

  const result = await updateKitchenToolRecord(
    userId,
    id.value,
    keepsCanonicalIdentity ? current.name : name.value,
    kind.value,
  );
  if (result.status === "not_found") {
    return valid({ status: "not_found", id: id.value });
  }
  if (result.status === "name_conflict") {
    const conflict = await getKitchenToolByCanonicalName(userId, name.value);
    if (!conflict) {
      throw new Error("kitchen tool conflict disappeared before lookup");
    }
    return valid({
      status: "name_conflict",
      id: id.value,
      conflictingTool: conflict,
    });
  }
  return valid({ status: "updated", tool: result.tool });
}

export async function deleteKitchenTool(
  userId: string,
  input: KitchenToolIdInput,
): Promise<KitchenServiceResult<DeleteKitchenToolOutcome>> {
  const id = normalizeUuid(input.id, "id");
  if (!id.ok) return id;

  const result = await deleteKitchenToolRecord(userId, id.value);
  return valid({ ...result, id: id.value });
}

export async function getKitchenContext(
  userId: string,
): Promise<KitchenContext> {
  const [items, tools] = await Promise.all([
    listPantryItems(userId),
    listKitchenTools(userId),
  ]);

  return {
    pantry: items.map((item) => {
      const quantityAmount = item.quantity_value;
      const quantityUnit = item.quantity_unit;
      const hasStructuredFields = quantityAmount !== null
        && quantityUnit !== null;
      const quantityMode = hasStructuredFields
        ? isPantryQuantityUnit(quantityUnit)
          ? "structured"
          : "unsupported"
        : item.quantity_text === ""
          ? "unknown"
          : "text";

      return {
        name: item.name,
        quantity: item.quantity,
        turnover: item.turnover,
        quantityMode,
        quantityAmount: hasStructuredFields ? quantityAmount : null,
        quantityUnit: hasStructuredFields ? quantityUnit : null,
      };
    }),
    tools: tools.map(({ name, kind }) => ({ name, kind })),
  };
}
