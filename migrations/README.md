# migrations

```bash
psql "$DATABASE_URL" -f migrations/001_schema.sql
psql "$DATABASE_URL" -f migrations/002_seed_oh_users.sql   # edit the email first
psql "$DATABASE_URL" -f migrations/003_candidate_display_name.sql
psql "$DATABASE_URL" -f migrations/004_staff_are_not_candidates.sql
psql "$DATABASE_URL" -f migrations/005_call_notes.sql
psql "$DATABASE_URL" -f migrations/006_fractional_stars.sql
```

**Numbered files run in order and are idempotent** — every statement is
`create ... if not exists` or `on conflict do nothing`, so re-running them is
safe. `001_schema.sql` is the baseline; a future schema change becomes
`003_<what_it_does>.sql` rather than an edit to `001`, once there is real
candidate data that has to survive it.

**Until then, `001_schema.sql` is edited in place.** The project is pre-launch,
and one readable baseline beats a chain of migrations against a database nobody
has depended on yet. The moment that stops being true, stop editing it.

## The unnumbered files are tools, not migrations

| File | What it does |
|---|---|
| `inspect.sql` | **Read-only.** Lists tables, row counts, and the shape of anything submission-like. Run this first, always. |
| `reset.sql` | **Destructive.** Drops every table and trigger function this project owns. Check `inspect.sql`'s row counts before you run it. |

Starting clean:

```bash
psql "$DATABASE_URL" -f migrations/inspect.sql   # look at the row counts
psql "$DATABASE_URL" -f migrations/reset.sql     # DESTRUCTIVE
psql "$DATABASE_URL" -f migrations/001_schema.sql
psql "$DATABASE_URL" -f migrations/002_seed_oh_users.sql
```

R2 audio objects are never touched by any of this. Orphaned keys stay in the
bucket; delete them separately if you care.

## If 001 refuses to run

It opens with a preflight block that checks every table's shape and raises with
a readable message naming what is wrong. That exists because
`create table if not exists` does **nothing** when a table of that name already
has different columns — it skips silently, and the failure surfaces several
statements later as `column "candidate_id" does not exist` (SQLSTATE 42703).
Follow what the message says.
