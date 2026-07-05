-- Routine variants (docs/ROUTINE_VARIANTS_PLAN.md), applied to the live DB
-- 2026-07-05. Additive columns on routines + a one-off backfill of existing
-- routines by name prefix (mapping approved). Each variant stays a routine
-- with its own template and session references; nothing downstream changes.
alter table routines add column if not exists category text;
alter table routines add column if not exists variant_label text;
alter table routines add column if not exists variant_order integer;

-- A trailing 1-2 char alphanumeric token after a space is the variant label
-- ("Legs A" -> "Legs","A"); otherwise the whole name is a single-variant
-- category. Only fills rows not already backfilled.
update routines
set category = case when name ~ '\s[A-Za-z0-9]{1,2}$' then regexp_replace(name, '\s[A-Za-z0-9]{1,2}$', '') else name end,
    variant_label = case when name ~ '\s[A-Za-z0-9]{1,2}$' then regexp_replace(name, '^.*\s([A-Za-z0-9]{1,2})$', '\1') else null end
where category is null;

update routines r
set variant_order = sub.ord
from (
  select id, (row_number() over (partition by category order by variant_label nulls first, name)) - 1 as ord
  from routines
) sub
where r.id = sub.id and r.variant_order is null;
