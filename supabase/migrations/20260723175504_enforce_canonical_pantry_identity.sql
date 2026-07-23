-- Pantry names were previously normalized only by individual application
-- callers. Establish the identity rule in Postgres so every transport sees one
-- unambiguous row per user and canonical name.
--
-- Production was inspected before this migration was written. It contained one
-- ownerless legacy seed row and two identical duplicate pairs, where only
-- id/created_at differed.
--
-- Fail before deleting anything if there is more ownerless/duplicate drift than
-- the audited aggregate or if any duplicate differs in a user-visible field.
-- The migration intentionally avoids publishing production user identifiers or
-- pantry contents.
create function public.canonical_pantry_name(raw_name text)
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

do $$
begin
  if (select count(*) from public.items where user_id is null) > 1 then
    raise exception
      'canonical pantry migration found an unexpected ownerless item';
  end if;

  if exists (
    with keyed as (
      select
        user_id,
        name,
        quantity,
        turnover,
        public.canonical_pantry_name(name) as name_key
      from public.items
      where user_id is not null
    ),
    duplicate_groups as (
      select
        user_id,
        name_key,
        count(*) as row_count,
        count(distinct name) as name_count,
        cardinality(array_agg(distinct quantity)) as quantity_count,
        count(distinct turnover) as turnover_count
      from keyed
      group by user_id, name_key
      having count(*) > 1
    )
    select 1
    from duplicate_groups
    where row_count <> 2
      or name_count <> 1
      or quantity_count <> 1
      or turnover_count <> 1
  ) then
    raise exception
      'canonical pantry migration found an unexpected or changed duplicate group';
  end if;

  if (
    select count(*)
    from (
      select 1
      from public.items
      where user_id is not null
      group by user_id, public.canonical_pantry_name(name)
      having count(*) > 1
    ) as duplicate_groups
  ) > 2 then
    raise exception
      'canonical pantry migration found more duplicate groups than audited';
  end if;
end
$$;

delete from public.items
where user_id is null;

-- Keep the oldest row in each asserted identical pair.
with ranked as (
  select
    id,
    row_number() over (
      partition by
        user_id,
        public.canonical_pantry_name(name)
      order by created_at, id
    ) as duplicate_rank
  from public.items
  where user_id is not null
)
delete from public.items
where id in (
  select id
  from ranked
  where duplicate_rank > 1
);

-- These assertions also guard environments where the known production rows
-- were absent but different legacy drift exists.
do $$
begin
  if exists (select 1 from public.items where user_id is null) then
    raise exception
      'canonical pantry migration cannot make user_id non-null while ownerless items remain';
  end if;

  if exists (
    select 1
    from public.items
    where user_id is not null
    group by user_id, public.canonical_pantry_name(name)
    having count(*) > 1
  ) then
    raise exception
      'canonical pantry migration cannot add uniqueness while duplicate names remain';
  end if;
end
$$;

alter table public.items
  alter column user_id set not null,
  add column name_key text collate "C"
    generated always as (public.canonical_pantry_name(name)) stored,
  add constraint items_user_id_name_key_key unique (user_id, name_key);

-- Supports the existing owned newest-first list, with id as a stable tie-break.
create index items_user_id_created_at_id_idx
  on public.items (user_id, created_at desc, id desc);
