-- Pantry items are consumable inventory. Keep their turnover classification
-- on the existing table so the UI can place frequently used items first.
-- Existing rows remain visible in that primary section until a user recategorizes
-- them through the forthcoming pantry UI.
alter table public.items
  add column turnover text not null default 'high';

-- One row is one durable kitchen tool owned by one user. Tools deliberately
-- live outside items: they are capabilities, not inventory with a quantity.
create table public.kitchen_tools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  kind text not null,
  created_at timestamptz not null default now()
);

-- The tools screen lists a user's tools newest-first; this also keeps the
-- ownership lookup selective as the table grows.
create index kitchen_tools_user_id_created_at_idx
  on public.kitchen_tools (user_id, created_at desc);

alter table public.kitchen_tools enable row level security;

create policy "kitchen_tools_user_isolation"
on public.kitchen_tools
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update, delete on public.kitchen_tools to authenticated;
