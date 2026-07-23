-- Durable, narrow idempotency receipts for reviewed pantry imports.
--
-- This is intentionally not an inventory history ledger. It records only the
-- request fingerprint and terminal outcome needed to make an explicitly
-- reviewed create/restock transaction safe to retry after an ambiguous client
-- or network response.
create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table private.pantry_operation_receipts (
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  operation_kind text not null,
  request_hash text not null,
  status text not null,
  outcome jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, request_id),
  constraint pantry_operation_receipts_kind_check
    check (operation_kind = 'reviewed_receipt_import'),
  constraint pantry_operation_receipts_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint pantry_operation_receipts_status_check
    check (status in ('processing', 'applied', 'rejected')),
  constraint pantry_operation_receipts_terminal_check
    check (
      (
        status = 'processing'
        and outcome is null
        and completed_at is null
      )
      or (
        status in ('applied', 'rejected')
        and outcome is not null
        and jsonb_typeof(outcome) = 'object'
        and outcome ->> 'status' = status
        and outcome ->> 'requestId' = request_id::text
        and completed_at is not null
      )
    )
);

alter table private.pantry_operation_receipts enable row level security;

create policy "pantry_operation_receipts_select_owned"
on private.pantry_operation_receipts
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "pantry_operation_receipts_insert_owned_non_oauth"
on private.pantry_operation_receipts
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "pantry_operation_receipts_update_owned_non_oauth"
on private.pantry_operation_receipts
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
)
with check (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

revoke all on table private.pantry_operation_receipts from public, anon;
grant select, insert, update
  on table private.pantry_operation_receipts
  to authenticated;

comment on table private.pantry_operation_receipts is
  'Effect-once receipts for reviewed pantry import transactions; not general inventory history.';
comment on column private.pantry_operation_receipts.request_hash is
  'SHA-256 of the normalized, ordered semantic request using PostgreSQL-owned canonical pantry names.';
comment on column private.pantry_operation_receipts.outcome is
  'Historical terminal result returned on an identical retry; never interpreted as current inventory.';
