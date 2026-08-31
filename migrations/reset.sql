-- ⚠️  DESTRUCTIVE. This DELETES every table and every row this project owns.
--
-- Run migrations/inspect.sql FIRST and look at the row counts. If anything there is real
-- candidate data, do not run this — write an ALTER-based migration instead.
--
-- This exists because the project is pre-launch: schema.sql is edited in place
-- and there is no migration framework until real candidate data must survive a
-- schema change (see docs/03-data-model.md §10).
--
--   psql "$DATABASE_URL" -f migrations/reset.sql
--   psql "$DATABASE_URL" -f migrations/001_schema.sql
--   psql "$DATABASE_URL" -f migrations/002_seed_oh_users.sql
--
-- Audio objects in R2 are NOT touched. Orphaned keys stay in the bucket; delete
-- them separately if you care.

begin;

-- Children before parents. `cascade` also removes the triggers and the two
-- trigger functions' dependencies.
drop table if exists sales_insight_submissions cascade;
drop table if exists submissions               cascade;
drop table if exists activity_logs             cascade;
drop table if exists candidates                cascade;
drop table if exists oh_users                  cascade;

-- Legacy, from the original two-table design.
drop table if exists admins cascade;

-- Trigger functions are not owned by any table, so `drop table cascade` leaves
-- them behind.
drop function if exists sales_insight_guard_parent()  cascade;
drop function if exists sales_insight_sync_overall()  cascade;

commit;
