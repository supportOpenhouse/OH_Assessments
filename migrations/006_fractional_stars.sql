-- 006 — scores go to one decimal place.
--
-- The bands stay whole numbers; the decimal places a candidate WITHIN a band, so
-- a 3.4 is a solid 3 rather than most of a 4. smallint silently TRUNCATES a 3.4
-- to 3 on cast, so this has to run before the first fractional score is written
-- or the parent quietly disagrees with the child's scores json.
--
-- Existing whole-number rows are unaffected: 3 becomes 3.0.
--
-- Also folded into 001_schema.sql, the baseline for a fresh database.

alter table submissions
  alter column overall_stars type numeric(2,1) using overall_stars::numeric(2,1);

-- The check already reads `between 0 and 5`, which holds for numeric, so it does
-- not need replacing. The trigger's cast does.
create or replace function sales_insight_sync_overall() returns trigger
language plpgsql as $$
begin
  update submissions
     set overall_stars = (new.scores -> 'overall' ->> 'stars')::numeric(2,1)
   where id = new.id;
  return new;
end;
$$;
