-- Kitchen tools share the pantry's user-visible identity rule. Keep the
-- original pantry function as a compatibility wrapper because the generated
-- items.name_key column already depends on it.
create function public.canonical_inventory_name(raw_name text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select lower(
    btrim(
      regexp_replace(
        normalize(raw_name, NFKC),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  )
$$;

create or replace function public.canonical_pantry_name(raw_name text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select public.canonical_inventory_name(raw_name)
$$;

-- Production was inspected before this migration was written. Its two rows
-- have distinct canonical names and both use the appliance kind. Preserve all
-- rows, and fail closed if any environment contains data that would require an
-- unreviewed merge or reclassification.
do $$
begin
  if exists (
    select 1
    from public.kitchen_tools
    where public.canonical_inventory_name(name) = ''
      or kind not in ('appliance', 'cookware', 'bakeware')
  ) then
    raise exception
      'kitchen tool migration found a blank canonical name or unsupported kind';
  end if;

  if exists (
    select 1
    from public.kitchen_tools
    group by user_id, public.canonical_inventory_name(name)
    having count(*) > 1
  ) then
    raise exception
      'kitchen tool migration found an unaudited canonical duplicate';
  end if;
end
$$;

alter table public.kitchen_tools
  add column name_key text collate "C"
    generated always as (public.canonical_inventory_name(name)) stored,
  add constraint kitchen_tools_name_not_blank
    check (public.canonical_inventory_name(name) <> ''),
  add constraint kitchen_tools_kind_check
    check (kind in ('appliance', 'cookware', 'bakeware')),
  add constraint kitchen_tools_user_id_name_key_key
    unique (user_id, name_key);

-- Preserve the existing newest-first access pattern with a stable tie-break.
drop index public.kitchen_tools_user_id_created_at_idx;
create index kitchen_tools_user_id_created_at_id_idx
  on public.kitchen_tools (user_id, created_at desc, id desc);
