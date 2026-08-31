-- READ-ONLY. Run this first: psql "$DATABASE_URL" -f migrations/inspect.sql
-- Shows what is actually in the database and whether anything holds real rows.

\echo '── tables present ─────────────────────────────────────────────────'
select table_name
  from information_schema.tables
 where table_schema = 'public'
 order by table_name;

\echo ''
\echo '── row counts (is any of this real data?) ──────────────────────────'
select relname as table_name, n_live_tup as approx_rows
  from pg_stat_user_tables
 order by n_live_tup desc, relname;

\echo ''
\echo '── shape of anything named like a submission ───────────────────────'
select table_name, ordinal_position as pos, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('submissions', 'sales_insight_submissions', 'admins',
                      'oh_users', 'candidates', 'activity_logs')
 order by table_name, ordinal_position;
