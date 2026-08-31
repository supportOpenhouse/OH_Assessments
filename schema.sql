-- OpenHouse · Assessments
-- Apply once to Neon:  psql "$DATABASE_URL" -f schema.sql
--
-- Three tables, split along the axis that actually scales:
--
--   oh_users                    who works here          (assessment-agnostic)
--   candidates                  who is being assessed   (assessment-agnostic)
--   sales_insight_submissions   one assessment's work   (per assessment type)
--
-- A second assessment type adds ONE table (see the recipe at the bottom of this
-- file). It does not touch oh_users or candidates, and it does not migrate any
-- existing data.

-- ── oh_users ──────────────────────────────────────────────────────────────
-- OpenHouse staff. Membership here is what grants elevated access — it is never
-- inferred from an email domain. An @openhouse.in address that is not in this
-- table is an ordinary candidate.
create table if not exists oh_users (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null unique,
  name        text,
  -- 'admin' sees every submission. Room for 'reviewer' (scoped to assigned
  -- assessments) when there is more than one assessment to scope to.
  role        text        not null default 'admin',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),

  constraint oh_users_role_valid check (role in ('admin', 'reviewer'))
);

-- ── candidates ────────────────────────────────────────────────────────────
-- One row per person, for their whole relationship with OpenHouse — not per
-- assessment. A candidate who later takes a second assessment type reuses this
-- row, which is the entire reason this table exists separately.
create table if not exists candidates (
  id             uuid primary key default gen_random_uuid(),
  email          text        not null unique,
  name           text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

-- ── sales_insight_submissions ─────────────────────────────────────────────
-- Sales (Insight) audio assessment. Scores are jsonb because the axes belong to
-- this assessment's rubric, not to the database.
create table if not exists sales_insight_submissions (
  -- Supplied by the application, not defaulted: the R2 object key and the row
  -- id are deliberately the same value.
  id             uuid        primary key,
  candidate_id   uuid        not null references candidates(id) on delete cascade,

  audio_key      text        not null,   -- R2 object key. Never a public URL
  audio_type     text,
  audio_bytes    bigint,
  duration_s     numeric(8,2),           -- from Scribe, authoritative

  status         text        not null default 'queued',

  transcript     text,
  metrics        jsonb,
  scores         jsonb,
  rubric_version text,                   -- sha256(rubric.md)[:12]
  model          text,
  stt_model      text,
  error          text,                   -- populated when status = 'failed'

  created_at     timestamptz not null default now(),
  scored_at      timestamptz,
  voided_at      timestamptz,
  voided_by      uuid        references oh_users(id),

  constraint sales_insight_status_valid
    check (status in ('queued', 'processing', 'scored', 'failed', 'voided'))
);

-- One live submission per candidate PER ASSESSMENT. Scoped to this table, so a
-- candidate who takes a future assessment type is unaffected by this one.
-- Voided rows are excluded, which is the entire retry mechanism: void the row
-- and the candidate can upload again.
--
-- This is what makes a double-clicked submit impossible at the database level
-- rather than the application level.
create unique index if not exists sales_insight_one_live
  on sales_insight_submissions (candidate_id)
  where status <> 'voided';

-- Admin board: newest first.
create index if not exists sales_insight_created_idx
  on sales_insight_submissions (created_at desc);

-- The startup sweep scans by status.
create index if not exists sales_insight_status_idx
  on sales_insight_submissions (status);


-- ══════════════════════════════════════════════════════════════════════════
-- Adding a new assessment type
-- ══════════════════════════════════════════════════════════════════════════
--
-- 1. Copy the sales_insight_submissions block above, rename it (e.g.
--    marketing_pitch_submissions), and keep the three indexes. Change the
--    columns that differ — a written assessment has no audio_key or duration_s.
--
-- 2. Copy the submission functions in backend/app/db.py into a new module and
--    change the table name. They are written with literal table names on
--    purpose: a shared, parameterised submissions layer would have to be
--    generic over columns that genuinely differ between assessment types.
--
-- 3. Add its rubric, routes, and admin page.
--
-- oh_users and candidates are untouched by any of this.
--
-- The one real cost of table-per-type: an "everything across all assessments"
-- admin view needs a UNION ALL over the per-type tables. Worth it while the
-- assessments genuinely differ in what they store; if they converge on an
-- identical shape, collapse them into one table with an assessment_type column.
