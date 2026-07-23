-- Keep the existing read-facing `quantity` field while separating arithmetic-
-- safe quantities from legacy prose. Existing nonblank values remain byte-for-
-- byte text; this migration does not guess units or convert historical data.
alter table public.items
  rename column quantity to quantity_text;

-- Empty strings already represent an unknown quantity in the application.
-- Normalize nullable/whitespace-only legacy values to that existing contract.
update public.items
set quantity_text = ''
where quantity_text is null
   or btrim(quantity_text) = '';

alter table public.items
  alter column quantity_text set default '',
  alter column quantity_text set not null,
  add column quantity_value numeric,
  add column quantity_unit text collate "C",
  add column quantity text not null
    generated always as (
      case
        when quantity_value is not null and quantity_unit = 'count' then
          trim_scale(quantity_value)::text
        when quantity_value is not null and quantity_unit is not null then
          trim_scale(quantity_value)::text || ' ' || quantity_unit
        else quantity_text
      end
    ) stored,
  add constraint items_quantity_text_length_check
    check (
      char_length(quantity_text) <= 100
      and (
        quantity_text = ''
        or btrim(quantity_text) <> ''
      )
    ),
  add constraint items_quantity_value_range_check
    check (
      quantity_value is null
      or (
        quantity_value >= 0
        and quantity_value <= 999999999.999999
      )
    ),
  add constraint items_quantity_value_scale_check
    check (quantity_value is null or scale(quantity_value) <= 6),
  add constraint items_quantity_unit_format_check
    check (
      quantity_unit is null
      or quantity_unit ~ '^[a-z][a-z0-9_]{0,31}$'
    ),
  add constraint items_quantity_mode_check
    check (
      (
        quantity_text = ''
        and quantity_value is null
        and quantity_unit is null
      )
      or (
        quantity_text <> ''
        and quantity_value is null
        and quantity_unit is null
      )
      or (
        quantity_text = ''
        and quantity_value is not null
        and quantity_unit is not null
      )
    );

comment on column public.items.quantity_text is
  'Lossless legacy/free-text quantity; blank means unknown and is mutually exclusive with structured quantity fields.';
comment on column public.items.quantity_value is
  'Nonnegative arithmetic-safe quantity bounded to nine integer and six fractional digits.';
comment on column public.items.quantity_unit is
  'Canonical application-owned soft-enum unit identifier.';
comment on column public.items.quantity is
  'Backward-compatible generated display for unknown, text, and structured quantity modes.';
