// src/lib/db.ts — THE BOUNDARY (database edition).
// Only file that imports the postgres driver. Swap DB/driver/host = change this file only.

import { createHash } from "node:crypto";
import postgres from "postgres";
import {
  adjustStructuredPantryQuantity,
  isPantryQuantityUnit,
  pantryQuantitiesEqual,
  pantryQuantityMatchesStoredFields,
  type PantryQuantity,
  type PantryQuantityAdjustmentOperation,
  type StructuredPantryQuantity,
} from "@/lib/pantry-quantity";

// DATABASE_URL must point at the dedicated `mise_app` login role (issue #64):
// non-owner, NOBYPASSRLS, no direct table DML. Owner/`BYPASSRLS` credentials
// stay out of the application pool (local tests use ADMIN_DATABASE_URL only
// for fixture setup).
//
// Production uses Supavisor's transaction pooler, where consecutive queries can
// land on different Postgres connections. Prepared statements are connection-local,
// so Postgres.js must send each query without trying to reuse one across connections.
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export type Turnover = "high" | "low";

export type Item = {
  id: number;
  name: string;
  name_key: string;
  quantity: string;
  quantity_text: string;
  quantity_value: string | null;
  quantity_unit: string | null;
  turnover: Turnover;
  created_at: string;
  user_id: string;
};

export type AddItemResult =
  | { status: "created"; item: Item }
  | { status: "already_exists"; item: Item };

export type UpdateItemResult =
  | { status: "updated"; item: Item }
  | { status: "not_found" }
  | { status: "name_conflict" };

export type UpdateItemChanges = {
  name?: string;
  quantity?: PantryQuantity;
  turnover?: Turnover;
};

export type DeleteItemsResult =
  | { status: "deleted"; ids: number[] }
  | { status: "not_found"; ids: number[] };

export type DeleteItemResult =
  | { status: "deleted" }
  | { status: "not_found" };

export type SetItemQuantityResult =
  | { status: "updated" | "unchanged"; item: Item; beforeQuantity: string }
  | { status: "not_found" };

export type AdjustItemQuantityResult =
  | {
      status: "applied";
      item: Item;
      beforeQuantity: string;
      afterQuantity: string;
      before: StructuredPantryQuantity;
      after: StructuredPantryQuantity;
    }
  | { status: "not_found" }
  | {
      status: "unsupported_quantity";
      currentDisplay: string;
    }
  | {
      status: "conflict";
      current: StructuredPantryQuantity;
    }
  | {
      status: "insufficient_quantity" | "amount_exceeded";
      current: StructuredPantryQuantity;
      delta: StructuredPantryQuantity;
    }
  | {
      status: "unit_mismatch";
      expectedUnit: StructuredPantryQuantity["unit"];
      deltaUnit: StructuredPantryQuantity["unit"];
    };

export type BatchPantryQuantityAdjustment = {
  name: string;
  operation: PantryQuantityAdjustmentOperation;
  expected: StructuredPantryQuantity;
  delta: StructuredPantryQuantity;
};

export type BatchPantryQuantityAdjustmentFailure =
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
      currentDisplay: string;
    }
  | {
      index: number;
      name: string;
      status: "conflict";
      current: StructuredPantryQuantity;
    }
  | {
      index: number;
      name: string;
      status: "insufficient_quantity" | "amount_exceeded";
      current: StructuredPantryQuantity;
      delta: StructuredPantryQuantity;
    }
  | {
      index: number;
      name: string;
      status: "unit_mismatch";
      expectedUnit: StructuredPantryQuantity["unit"];
      deltaUnit: StructuredPantryQuantity["unit"];
    };

export type BatchPantryQuantityAdjustmentResult =
  | {
      status: "applied";
      changes: Array<{
        index: number;
        operation: PantryQuantityAdjustmentOperation;
        item: Item;
        beforeQuantity: string;
        afterQuantity: string;
        before: StructuredPantryQuantity;
        delta: StructuredPantryQuantity;
        after: StructuredPantryQuantity;
      }>;
    }
  | {
      status: "rejected";
      failures: BatchPantryQuantityAdjustmentFailure[];
    };

export type ReviewedReceiptImportLine =
  | {
      decision: "create";
      name: string;
      quantity: StructuredPantryQuantity;
      turnover: Turnover;
    }
  | {
      decision: "restock";
      name: string;
      expected: StructuredPantryQuantity;
      delta: StructuredPantryQuantity;
    };

export type ReviewedReceiptImportFailure =
  | {
      index: number;
      name: string;
      status: "duplicate_target";
      duplicateIndexes: number[];
    }
  | { index: number; name: string; status: "already_exists" | "not_found" }
  | {
      index: number;
      name: string;
      status: "unsupported_quantity";
      currentDisplay: string;
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
    };

type ReviewedReceiptImportTerminalOutcome =
  | {
      status: "applied";
      requestId: string;
      changes: Array<
        | {
            index: number;
            decision: "create";
            item: Pick<Item, "name" | "quantity" | "turnover">;
          }
        | {
            index: number;
            decision: "restock";
            item: Pick<Item, "name" | "quantity" | "turnover">;
            beforeQuantity: string;
            afterQuantity: string;
            before: StructuredPantryQuantity;
            delta: StructuredPantryQuantity;
            after: StructuredPantryQuantity;
          }
      >;
    }
  | {
      status: "rejected";
      requestId: string;
      failures: ReviewedReceiptImportFailure[];
    };

export type ReviewedReceiptImportResult =
  | (ReviewedReceiptImportTerminalOutcome & { replayed: boolean })
  | {
      status: "request_id_reused";
      requestId: string;
    };

type PantryQuantityColumns = {
  text: string;
  value: string | null;
  unit: string | null;
};

type AdjustmentEvaluation =
  | {
      ok: true;
      before: StructuredPantryQuantity;
      after: StructuredPantryQuantity;
    }
  | {
      ok: false;
      failure: Exclude<
        AdjustItemQuantityResult,
        { status: "applied" } | { status: "not_found" }
      >;
    };

function pantryQuantityColumns(
  quantity: PantryQuantity,
): PantryQuantityColumns {
  switch (quantity.mode) {
    case "unknown":
      return { text: "", value: null, unit: null };
    case "text":
      return { text: quantity.text, value: null, unit: null };
    case "structured":
      return { text: "", value: quantity.amount, unit: quantity.unit };
  }
}

export type KitchenTool = {
  id: string;
  user_id: string;
  name: string;
  name_key: string;
  kind: KitchenToolKind;
  created_at: string;
};

export type KitchenToolKind = "appliance" | "cookware" | "bakeware";

export type AddKitchenToolResult =
  | { status: "created"; tool: KitchenTool }
  | { status: "already_exists"; tool: KitchenTool };

export type UpdateKitchenToolResult =
  | { status: "updated"; tool: KitchenTool }
  | { status: "not_found" }
  | { status: "name_conflict" };

export type DeleteKitchenToolResult =
  | { status: "deleted" }
  | { status: "not_found" };

export type DatabaseConnectionSafety = {
  currentUser: string;
  sessionUser: string;
  rolsuper: boolean;
  rolinherit: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  canSetAuthenticated: boolean;
  hasUnexpectedMemberships: boolean;
  ownsPublicTables: boolean;
};

/**
 * Inspect the live pool role. Used by integration tests and production
 * verification after rotating DATABASE_URL onto `mise_app`.
 */
export async function getDatabaseConnectionSafety(): Promise<DatabaseConnectionSafety> {
  const [row] = await sql<
    {
      current_user: string;
      session_user: string;
      rolsuper: boolean;
      rolinherit: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
      can_set_authenticated: boolean;
      has_unexpected_memberships: boolean;
      owns_public_tables: boolean;
    }[]
  >`
    select
      current_user,
      session_user,
      r.rolsuper,
      r.rolinherit,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      r.rolbypassrls,
      pg_has_role(r.oid, 'authenticated', 'MEMBER') as can_set_authenticated,
      exists (
        select 1
        from pg_auth_members membership
        join pg_roles parent_role on parent_role.oid = membership.roleid
        where membership.member = r.oid
          and parent_role.rolname <> 'authenticated'
      ) as has_unexpected_memberships,
      exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
          and c.relowner = r.oid
      ) as owns_public_tables
    from pg_roles r
    where r.rolname = current_user
  `;
  return {
    currentUser: row.current_user,
    sessionUser: row.session_user,
    rolsuper: row.rolsuper,
    rolinherit: row.rolinherit,
    rolcreatedb: row.rolcreatedb,
    rolcreaterole: row.rolcreaterole,
    rolreplication: row.rolreplication,
    rolbypassrls: row.rolbypassrls,
    canSetAuthenticated: row.can_set_authenticated,
    hasUnexpectedMemberships: row.has_unexpected_memberships,
    ownsPublicTables: row.owns_public_tables,
  };
}

// Connect as `mise_app` (fail closed: no table DML, no BYPASSRLS). Each request
// enters withUserContext, which SET ROLE authenticated + stamps auth.uid() so
// ownership policies on items, kitchen_tools, conversations, and messages apply.
// App-level user_id / parent-ownership predicates remain the first layer; RLS is
// the second. Omitting withUserContext cannot silently run as table owner.
async function withUserContext<T>(
  userId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

export async function getItems(userId: string): Promise<Item[]> {
  return withUserContext(userId, (tx) =>
    tx<Item[]>`
      select * from items
      where user_id = ${userId}
      order by created_at desc, id desc
    `,
  );
}

export async function getItemById(
  userId: string,
  id: number,
): Promise<Item | null> {
  return withUserContext(userId, async (tx) => {
    const [item] = await tx<Item[]>`
      select * from items
      where user_id = ${userId} and id = ${id}
    `;
    return item ?? null;
  });
}

export async function getItemByCanonicalName(
  userId: string,
  name: string,
): Promise<Item | null> {
  return withUserContext(userId, async (tx) => {
    const [item] = await tx<Item[]>`
      select * from items
      where user_id = ${userId}
        and name_key = public.canonical_pantry_name(${name})
    `;
    return item ?? null;
  });
}

export async function addItem(
  userId: string,
  name: string,
  quantity: PantryQuantity,
  turnover: Turnover = "high",
): Promise<AddItemResult> {
  return withUserContext(userId, async (tx) => {
    const columns = pantryQuantityColumns(quantity);
    const [item] = await tx<Item[]>`
      insert into items (
        user_id,
        name,
        quantity_text,
        quantity_value,
        quantity_unit,
        turnover
      )
      values (
        ${userId},
        ${name},
        ${columns.text},
        ${columns.value}::numeric,
        ${columns.unit},
        ${turnover}
      )
      on conflict (user_id, name_key) do nothing
      returning *
    `;
    if (item) return { status: "created", item };

    const [existing] = await tx<Item[]>`
      select * from items
      where user_id = ${userId}
        and name_key = public.canonical_pantry_name(${name})
    `;
    if (!existing) {
      throw new Error("pantry item conflict disappeared before lookup");
    }
    return { status: "already_exists", item: existing };
  });
}

export async function updateItem(
  userId: string,
  id: number,
  changes: UpdateItemChanges,
  expectedName?: string,
): Promise<UpdateItemResult> {
  try {
    return await withUserContext(userId, async (tx) => {
      const quantity = changes.quantity === undefined
        ? null
        : pantryQuantityColumns(changes.quantity);
      const [item] = await tx<Item[]>`
        update items
        set quantity_text = case
              when ${quantity !== null}
                then ${quantity?.text ?? ""}
              else quantity_text
            end,
            quantity_value = case
              when ${quantity !== null}
                then ${quantity?.value ?? null}::numeric
              else quantity_value
            end,
            quantity_unit = case
              when ${quantity !== null}
                then ${quantity?.unit ?? null}
              else quantity_unit
            end,
            name = case
              when ${changes.name !== undefined}
                then ${changes.name ?? ""}
              else name
            end,
            turnover = case
              when ${changes.turnover !== undefined}
                then ${changes.turnover ?? "high"}
              else turnover
            end
        where id = ${id}
          and user_id = ${userId}
          and (${expectedName ?? null}::text is null or name = ${expectedName ?? null})
        returning *
      `;
      return item
        ? { status: "updated", item }
        : { status: "not_found" };
    });
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "23505"
      && "constraint_name" in error
      && error.constraint_name === "items_user_id_name_key_key"
    ) {
      return { status: "name_conflict" };
    }
    throw error;
  }
}

export async function setItemQuantityByCanonicalName(
  userId: string,
  name: string,
  quantity: PantryQuantity,
): Promise<SetItemQuantityResult> {
  return withUserContext(userId, async (tx) => {
    const [current] = await tx<Item[]>`
      select *
      from items
      where user_id = ${userId}
        and name_key = public.canonical_pantry_name(${name})
      for update
    `;
    if (!current) return { status: "not_found" };

    const beforeQuantity = current.quantity;
    if (pantryQuantityMatchesStoredFields(quantity, current)) {
      return { status: "unchanged", item: current, beforeQuantity };
    }

    const columns = pantryQuantityColumns(quantity);
    const [item] = await tx<Item[]>`
      update items
      set quantity_text = ${columns.text},
          quantity_value = ${columns.value}::numeric,
          quantity_unit = ${columns.unit}
      where id = ${current.id} and user_id = ${userId}
      returning *
    `;
    if (!item) return { status: "not_found" };
    return { status: "updated", item, beforeQuantity };
  });
}

function evaluateStructuredAdjustment(
  current: Item,
  adjustment: PantryQuantityAdjustmentOperation,
  expected: StructuredPantryQuantity,
  delta: StructuredPantryQuantity,
): AdjustmentEvaluation {
  if (expected.unit !== delta.unit) {
    return {
      ok: false,
      failure: {
        status: "unit_mismatch",
        expectedUnit: expected.unit,
        deltaUnit: delta.unit,
      },
    };
  }

  if (
    current.quantity_value === null
    || current.quantity_unit === null
    || !isPantryQuantityUnit(current.quantity_unit)
  ) {
    return {
      ok: false,
      failure: {
        status: "unsupported_quantity",
        currentDisplay: current.quantity,
      },
    };
  }

  const currentQuantity: StructuredPantryQuantity = {
    mode: "structured",
    amount: current.quantity_value,
    unit: current.quantity_unit,
    text: null,
  };
  if (!pantryQuantitiesEqual(currentQuantity, expected)) {
    return {
      ok: false,
      failure: {
        status: "conflict",
        current: currentQuantity,
      },
    };
  }

  const calculation = adjustStructuredPantryQuantity(
    currentQuantity,
    delta,
    adjustment,
  );
  if (!calculation.ok) {
    if (calculation.code === "invalid_delta") {
      throw new RangeError("pantry quantity adjustment must be positive");
    }
    if (calculation.code === "invalid_current") {
      return {
        ok: false,
        failure: {
          status: "unsupported_quantity",
          currentDisplay: current.quantity,
        },
      };
    }
    if (calculation.code === "unit_mismatch") {
      return {
        ok: false,
        failure: {
          status: "unit_mismatch",
          expectedUnit: expected.unit,
          deltaUnit: delta.unit,
        },
      };
    }
    if (calculation.code === "insufficient_quantity") {
      return {
        ok: false,
        failure: {
          status: "insufficient_quantity",
          current: currentQuantity,
          delta,
        },
      };
    }
    return {
      ok: false,
      failure: {
        status: "amount_exceeded",
        current: currentQuantity,
        delta,
      },
    };
  }

  return {
    ok: true,
    before: currentQuantity,
    after: calculation.value,
  };
}

/**
 * Apply one relative inventory change under the owned row's lock.
 *
 * The expected quantity is the retry/concurrency token: once one caller
 * applies, another caller carrying the same expectation observes the updated
 * row after waiting for the lock and returns `conflict`. Arithmetic uses the
 * shared fixed-scale BigInt domain helper; JavaScript never converts an amount
 * to a Number.
 */
export async function adjustItemQuantityByCanonicalName(
  userId: string,
  name: string,
  adjustment: PantryQuantityAdjustmentOperation,
  expected: StructuredPantryQuantity,
  delta: StructuredPantryQuantity,
): Promise<AdjustItemQuantityResult> {
  if (expected.unit !== delta.unit) {
    return {
      status: "unit_mismatch",
      expectedUnit: expected.unit,
      deltaUnit: delta.unit,
    };
  }

  return withUserContext(userId, async (tx) => {
    const [current] = await tx<Item[]>`
      select *
      from items
      where user_id = ${userId}
        and name_key = public.canonical_pantry_name(${name})
      for update
    `;
    if (!current) return { status: "not_found" };

    const evaluation = evaluateStructuredAdjustment(
      current,
      adjustment,
      expected,
      delta,
    );
    if (!evaluation.ok) return evaluation.failure;

    const [item] = await tx<Item[]>`
      update items
      set quantity_value = ${evaluation.after.amount}::numeric
      where id = ${current.id}
        and user_id = ${userId}
      returning *
    `;
    if (!item) return { status: "not_found" };

    return {
      status: "applied",
      item,
      beforeQuantity: current.quantity,
      afterQuantity: item.quantity,
      before: evaluation.before,
      after: evaluation.after,
    };
  });
}

/**
 * Apply a reviewed group of relative changes as one inventory decision.
 *
 * PostgreSQL remains the canonical-name authority. Every owned target is
 * locked in canonical order before the snapshot is evaluated, and no row is
 * updated unless every requested change can apply.
 */
export async function adjustItemQuantitiesByCanonicalName(
  userId: string,
  adjustments: BatchPantryQuantityAdjustment[],
): Promise<BatchPantryQuantityAdjustmentResult> {
  return withUserContext(userId, async (tx) => {
    const requestedNames = adjustments.map(({ name }) => name);
    const canonicalTargets = await tx<
      Array<{
        request_index: number;
        name: string;
        name_key: string;
      }>
    >`
      select
        (requested.ordinality - 1)::integer as request_index,
        requested.name,
        public.canonical_pantry_name(requested.name) as name_key
      from unnest(${tx.array(requestedNames)}::text[])
        with ordinality as requested(name, ordinality)
      order by requested.ordinality
    `;

    const indexesByNameKey = new Map<string, number[]>();
    for (const target of canonicalTargets) {
      const indexes = indexesByNameKey.get(target.name_key) ?? [];
      indexes.push(target.request_index);
      indexesByNameKey.set(target.name_key, indexes);
    }
    const duplicateFailures = canonicalTargets.flatMap((target) => {
      const duplicateIndexes = indexesByNameKey.get(target.name_key) ?? [];
      return duplicateIndexes.length > 1
        ? [{
            index: target.request_index,
            name: target.name,
            status: "duplicate_target" as const,
            duplicateIndexes,
          }]
        : [];
    });

    const uniqueTargets = canonicalTargets.filter(
      ({ name_key }) => (indexesByNameKey.get(name_key)?.length ?? 0) === 1,
    );
    const nameKeys = uniqueTargets.map(({ name_key }) => name_key);
    const lockedItems = await tx<Item[]>`
      select *
      from items
      where user_id = ${userId}
        and name_key = any(${tx.array(nameKeys)}::text[])
      order by name_key
      for update
    `;
    const itemByNameKey = new Map(
      lockedItems.map((item) => [item.name_key, item]),
    );

    const evaluations: Array<{
      index: number;
      adjustment: BatchPantryQuantityAdjustment;
      item: Item;
      evaluation: Extract<AdjustmentEvaluation, { ok: true }>;
    }> = [];
    const failures: BatchPantryQuantityAdjustmentFailure[] = [
      ...duplicateFailures,
    ];

    for (const target of uniqueTargets) {
      const adjustment = adjustments[target.request_index];
      const item = itemByNameKey.get(target.name_key);
      if (!item) {
        failures.push({
          index: target.request_index,
          name: adjustment.name,
          status: "not_found",
        });
        continue;
      }

      const evaluation = evaluateStructuredAdjustment(
        item,
        adjustment.operation,
        adjustment.expected,
        adjustment.delta,
      );
      if (!evaluation.ok) {
        failures.push({
          index: target.request_index,
          name: adjustment.name,
          ...evaluation.failure,
        });
        continue;
      }
      evaluations.push({
        index: target.request_index,
        adjustment,
        item,
        evaluation,
      });
    }

    if (failures.length > 0) {
      return {
        status: "rejected",
        failures: failures.sort((left, right) => left.index - right.index),
      };
    }

    const changes: Extract<
      BatchPantryQuantityAdjustmentResult,
      { status: "applied" }
    >["changes"] = [];
    for (
      const { index, adjustment, item, evaluation }
      of evaluations.sort((left, right) => left.index - right.index)
    ) {
      const [updated] = await tx<Item[]>`
        update items
        set quantity_value = ${evaluation.after.amount}::numeric
        where id = ${item.id}
          and user_id = ${userId}
        returning *
      `;
      if (!updated) {
        throw new Error("locked pantry item disappeared before batch update");
      }
      changes.push({
        index,
        operation: adjustment.operation,
        item: updated,
        beforeQuantity: item.quantity,
        afterQuantity: updated.quantity,
        before: evaluation.before,
        delta: adjustment.delta,
        after: evaluation.after,
      });
    }

    return { status: "applied", changes };
  });
}

type PantryOperationReceiptRow = {
  request_hash: string;
  status: "processing" | "applied" | "rejected";
  outcome: ReviewedReceiptImportTerminalOutcome | null;
};

function reviewedReceiptRequestHash(
  canonicalTargets: Array<{ name_key: string }>,
  lines: ReviewedReceiptImportLine[],
): string {
  const normalized = lines.map((line, index) => {
    const target = canonicalTargets[index];
    return line.decision === "create"
      ? {
          decision: line.decision,
          nameKey: target.name_key,
          displayName: line.name,
          quantity: {
            amount: line.quantity.amount,
            unit: line.quantity.unit,
          },
          turnover: line.turnover,
        }
      : {
          decision: line.decision,
          nameKey: target.name_key,
          expected: {
            amount: line.expected.amount,
            unit: line.expected.unit,
          },
          delta: {
            amount: line.delta.amount,
            unit: line.delta.unit,
          },
        };
  });

  return createHash("sha256")
    .update(JSON.stringify({
      operationKind: "reviewed_receipt_import",
      lines: normalized,
    }))
    .digest("hex");
}

async function completePantryOperationReceipt(
  tx: postgres.TransactionSql,
  userId: string,
  requestId: string,
  outcome: ReviewedReceiptImportTerminalOutcome,
): Promise<void> {
  const result = await tx`
    update private.pantry_operation_receipts
    set status = ${outcome.status},
        outcome = ${tx.json(outcome as unknown as postgres.JSONValue)},
        completed_at = now()
    where user_id = ${userId}
      and request_id = ${requestId}::uuid
      and status = 'processing'
  `;
  if (result.count !== 1) {
    throw new Error("pantry operation receipt disappeared before completion");
  }
}

async function runReviewedReceiptImport(
  userId: string,
  requestId: string,
  lines: ReviewedReceiptImportLine[],
): Promise<ReviewedReceiptImportResult> {
  return withUserContext(userId, async (tx) => {
    const canonicalTargets = await tx<
      Array<{
        request_index: number;
        name: string;
        name_key: string;
      }>
    >`
      select
        (requested.ordinality - 1)::integer as request_index,
        requested.name,
        public.canonical_pantry_name(requested.name) as name_key
      from unnest(${tx.array(lines.map(({ name }) => name))}::text[])
        with ordinality as requested(name, ordinality)
      order by requested.ordinality
    `;
    const requestHash = reviewedReceiptRequestHash(canonicalTargets, lines);

    const [claimed] = await tx<PantryOperationReceiptRow[]>`
      insert into private.pantry_operation_receipts (
        user_id,
        request_id,
        operation_kind,
        request_hash,
        status
      )
      values (
        ${userId},
        ${requestId}::uuid,
        'reviewed_receipt_import',
        ${requestHash},
        'processing'
      )
      on conflict (user_id, request_id) do nothing
      returning request_hash, status, outcome
    `;
    if (!claimed) {
      const [existing] = await tx<PantryOperationReceiptRow[]>`
        select request_hash, status, outcome
        from private.pantry_operation_receipts
        where user_id = ${userId}
          and request_id = ${requestId}::uuid
      `;
      if (!existing) {
        throw new Error("pantry operation receipt conflict disappeared");
      }
      if (existing.request_hash !== requestHash) {
        return { status: "request_id_reused", requestId };
      }
      if (existing.status === "processing" || existing.outcome === null) {
        throw new Error("committed pantry operation receipt is not terminal");
      }
      return { ...existing.outcome, replayed: true };
    }

    const indexesByNameKey = new Map<string, number[]>();
    for (const target of canonicalTargets) {
      const indexes = indexesByNameKey.get(target.name_key) ?? [];
      indexes.push(target.request_index);
      indexesByNameKey.set(target.name_key, indexes);
    }
    const duplicateFailures: ReviewedReceiptImportFailure[] =
      canonicalTargets.flatMap((target) => {
        const duplicateIndexes = indexesByNameKey.get(target.name_key) ?? [];
        return duplicateIndexes.length > 1
          ? [{
              index: target.request_index,
              name: target.name,
              status: "duplicate_target" as const,
              duplicateIndexes,
            }]
          : [];
      });
    const uniqueTargets = canonicalTargets.filter(
      ({ name_key }) => (indexesByNameKey.get(name_key)?.length ?? 0) === 1,
    );
    const sortedNameKeys = uniqueTargets
      .map(({ name_key }) => name_key)
      .sort();
    for (const nameKey of sortedNameKeys) {
      await tx`
        select pg_advisory_xact_lock(
          hashtextextended(${`${userId}:${nameKey}`}, 0)
        )
      `;
    }

    const lockedItems = await tx<Item[]>`
      select *
      from items
      where user_id = ${userId}
        and name_key = any(${tx.array(sortedNameKeys)}::text[])
      order by name_key
      for update
    `;
    const itemByNameKey = new Map(
      lockedItems.map((item) => [item.name_key, item]),
    );

    const failures: ReviewedReceiptImportFailure[] = [...duplicateFailures];
    const restockEvaluations = new Map<
      number,
      {
        item: Item;
        evaluation: Extract<AdjustmentEvaluation, { ok: true }>;
      }
    >();
    for (const target of uniqueTargets) {
      const line = lines[target.request_index];
      const item = itemByNameKey.get(target.name_key);
      if (line.decision === "create") {
        if (item) {
          failures.push({
            index: target.request_index,
            name: line.name,
            status: "already_exists",
          });
        }
        continue;
      }
      if (!item) {
        failures.push({
          index: target.request_index,
          name: line.name,
          status: "not_found",
        });
        continue;
      }

      const evaluation = evaluateStructuredAdjustment(
        item,
        "restock",
        line.expected,
        line.delta,
      );
      if (!evaluation.ok) {
        failures.push(evaluation.failure.status === "conflict"
          ? {
              index: target.request_index,
              name: line.name,
              expected: line.expected,
              ...evaluation.failure,
            }
          : {
              index: target.request_index,
              name: line.name,
              ...evaluation.failure,
            });
        continue;
      }
      restockEvaluations.set(target.request_index, { item, evaluation });
    }

    if (failures.length > 0) {
      const outcome: ReviewedReceiptImportTerminalOutcome = {
        status: "rejected",
        requestId,
        failures: failures.sort((left, right) => left.index - right.index),
      };
      await completePantryOperationReceipt(tx, userId, requestId, outcome);
      return { ...outcome, replayed: false };
    }

    const changes: Extract<
      ReviewedReceiptImportTerminalOutcome,
      { status: "applied" }
    >["changes"] = [];
    for (const [index, line] of lines.entries()) {
      if (line.decision === "create") {
        const columns = pantryQuantityColumns(line.quantity);
        const [item] = await tx<Item[]>`
          insert into items (
            user_id,
            name,
            quantity_text,
            quantity_value,
            quantity_unit,
            turnover
          )
          values (
            ${userId},
            ${line.name},
            ${columns.text},
            ${columns.value}::numeric,
            ${columns.unit},
            ${line.turnover}
          )
          returning *
        `;
        changes.push({
          index,
          decision: line.decision,
          item: {
            name: item.name,
            quantity: item.quantity,
            turnover: item.turnover,
          },
        });
        continue;
      }

      const prepared = restockEvaluations.get(index);
      if (!prepared) {
        throw new Error("validated receipt restock lost its evaluation");
      }
      const [item] = await tx<Item[]>`
        update items
        set quantity_value = ${prepared.evaluation.after.amount}::numeric
        where id = ${prepared.item.id}
          and user_id = ${userId}
        returning *
      `;
      if (!item) {
        throw new Error("locked pantry item disappeared before receipt restock");
      }
      changes.push({
        index,
        decision: line.decision,
        item: {
          name: item.name,
          quantity: item.quantity,
          turnover: item.turnover,
        },
        beforeQuantity: prepared.item.quantity,
        afterQuantity: item.quantity,
        before: prepared.evaluation.before,
        delta: line.delta,
        after: prepared.evaluation.after,
      });
    }

    const outcome: ReviewedReceiptImportTerminalOutcome = {
      status: "applied",
      requestId,
      changes,
    };
    await completePantryOperationReceipt(tx, userId, requestId, outcome);
    return { ...outcome, replayed: false };
  });
}

function shouldRetryReviewedReceiptImport(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  if (error.code === "40001" || error.code === "40P01") return true;
  return error.code === "23505"
    && "constraint_name" in error
    && error.constraint_name === "items_user_id_name_key_key";
}

/**
 * Apply an already-reviewed receipt decision exactly once.
 *
 * The receipt row, every create/restock, and the terminal outcome commit in one
 * transaction. An identical retry returns the historical result with
 * `replayed: true`; it never performs the mutations a second time.
 */
export async function applyReviewedReceiptImport(
  userId: string,
  requestId: string,
  lines: ReviewedReceiptImportLine[],
): Promise<ReviewedReceiptImportResult> {
  try {
    return await runReviewedReceiptImport(userId, requestId, lines);
  } catch (error) {
    if (!shouldRetryReviewedReceiptImport(error)) throw error;
    return runReviewedReceiptImport(userId, requestId, lines);
  }
}

export async function deleteItem(
  userId: string,
  id: number,
  expectedName?: string,
): Promise<DeleteItemResult> {
  return withUserContext(userId, async (tx) => {
    const [deleted] = await tx<{ id: number }[]>`
      delete from items
      where id = ${id}
        and user_id = ${userId}
        and (${expectedName ?? null}::text is null or name = ${expectedName ?? null})
      returning id
    `;
    return deleted ? { status: "deleted" } : { status: "not_found" };
  });
}

export async function deleteItems(
  userId: string,
  ids: number[],
): Promise<DeleteItemsResult> {
  return withUserContext(userId, async (tx) => {
    const owned = await tx<{ id: number }[]>`
      select id
      from items
      where user_id = ${userId}
        and id = any(${tx.array(ids)}::bigint[])
      order by id
      for update
    `;
    const ownedIds = new Set(owned.map(({ id }) => Number(id)));
    const missingIds = ids.filter((id) => !ownedIds.has(id));
    if (missingIds.length > 0) {
      return { status: "not_found", ids: missingIds };
    }

    await tx`
      delete from items
      where user_id = ${userId}
        and id = any(${tx.array(ids)}::bigint[])
    `;
    return { status: "deleted", ids };
  });
}

export async function getKitchenTools(userId: string): Promise<KitchenTool[]> {
  return withUserContext(userId, (tx) =>
    tx<KitchenTool[]>`
      select * from kitchen_tools
      where user_id = ${userId}
      order by created_at desc
    `,
  );
}

export async function getKitchenToolById(
  userId: string,
  id: string,
): Promise<KitchenTool | null> {
  return withUserContext(userId, async (tx) => {
    const [tool] = await tx<KitchenTool[]>`
      select * from kitchen_tools
      where user_id = ${userId} and id = ${id}
    `;
    return tool ?? null;
  });
}

export async function getKitchenToolByCanonicalName(
  userId: string,
  name: string,
): Promise<KitchenTool | null> {
  return withUserContext(userId, async (tx) => {
    const [tool] = await tx<KitchenTool[]>`
      select * from kitchen_tools
      where user_id = ${userId}
        and name_key = public.canonical_inventory_name(${name})
    `;
    return tool ?? null;
  });
}

export async function addKitchenTool(
  userId: string,
  name: string,
  kind: KitchenToolKind,
): Promise<AddKitchenToolResult> {
  return withUserContext(userId, async (tx) => {
    const [tool] = await tx<KitchenTool[]>`
      insert into kitchen_tools (user_id, name, kind)
      values (${userId}, ${name}, ${kind})
      on conflict (user_id, name_key) do nothing
      returning *
    `;
    if (tool) return { status: "created", tool };

    const [existing] = await tx<KitchenTool[]>`
      select * from kitchen_tools
      where user_id = ${userId}
        and name_key = public.canonical_inventory_name(${name})
    `;
    if (!existing) {
      throw new Error("kitchen tool conflict disappeared before lookup");
    }
    return { status: "already_exists", tool: existing };
  });
}

export async function updateKitchenTool(
  userId: string,
  id: string,
  name: string,
  kind: KitchenToolKind,
  expectedName?: string,
): Promise<UpdateKitchenToolResult> {
  try {
    return await withUserContext(userId, async (tx) => {
      const [tool] = await tx<KitchenTool[]>`
        update kitchen_tools
        set name = ${name}, kind = ${kind}
        where id = ${id}
          and user_id = ${userId}
          and (${expectedName ?? null}::text is null or name = ${expectedName ?? null})
        returning *
      `;
      return tool
        ? { status: "updated", tool }
        : { status: "not_found" };
    });
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "23505"
      && "constraint_name" in error
      && error.constraint_name === "kitchen_tools_user_id_name_key_key"
    ) {
      return { status: "name_conflict" };
    }
    throw error;
  }
}

export async function deleteKitchenTool(
  userId: string,
  id: string,
  expectedName?: string,
): Promise<DeleteKitchenToolResult> {
  return withUserContext(userId, async (tx) => {
    const [deleted] = await tx<{ id: string }[]>`
      delete from kitchen_tools
      where id = ${id}
        and user_id = ${userId}
        and (${expectedName ?? null}::text is null or name = ${expectedName ?? null})
      returning id
    `;
    return deleted ? { status: "deleted" } : { status: "not_found" };
  });
}

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export async function createConversation(userId: string, title: string, id: string): Promise<Conversation> {
  return withUserContext(userId, async (tx) => {
    const [conversation] = await tx<Conversation[]>`
      insert into conversations (id, user_id, title)
      values (${id}, ${userId}, ${title})
      returning *
    `;
    return conversation;
  });
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  return withUserContext(userId, (tx) =>
    tx<Conversation[]>`
      select * from conversations
      where user_id = ${userId}
      order by created_at desc
    `,
  );
}

export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  return withUserContext(userId, async (tx) => {
    const [conversation] = await tx<Conversation[]>`
      select * from conversations
      where id = ${id} and user_id = ${userId}
    `;
    return conversation ?? null;
  });
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  // messages rows cascade via the ON DELETE CASCADE FK on messages.conversation_id.
  await withUserContext(userId, (tx) =>
    tx`
      delete from conversations
      where id = ${id} and user_id = ${userId}
    `,
  );
}

export async function getMessages(userId: string, conversationId: string): Promise<Message[]> {
  // Ownership is enforced twice: the where-exists predicate (app layer) and the
  // messages_via_conversation_owner RLS policy (database layer).
  return withUserContext(userId, (tx) =>
    tx<Message[]>`
      select m.*
      from messages m
      where m.conversation_id = ${conversationId}
        and exists (
          select 1
          from conversations c
          where c.id = m.conversation_id
            and c.user_id = ${userId}
        )
      order by m.created_at asc
    `,
  );
}

export async function addMessage(
  userId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<Message> {
  // Require parent ownership in the insert itself. RLS also checks this; the
  // explicit predicate keeps the first authorization layer in application SQL
  // and blocks cross-user appends even if a future caller skips a prior lookup.
  return withUserContext(userId, async (tx) => {
    const [message] = await tx<Message[]>`
      insert into messages (conversation_id, role, content)
      select ${conversationId}, ${role}, ${content}
      where exists (
        select 1
        from conversations c
        where c.id = ${conversationId}
          and c.user_id = ${userId}
      )
      returning *
    `;
    if (!message) {
      throw new Error("conversation not found or not owned by user");
    }
    return message;
  });
}
