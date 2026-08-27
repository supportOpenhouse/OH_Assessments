-- OpenHouse · Sales (Insight) Audio Assessment
-- Apply once to Neon:  psql "$DATABASE_URL" -f schema.sql
-- Pre-launch: this file is edited in place. No migration framework until real
-- candidate data must survive a schema change.

-- ── admins ────────────────────────────────────────────────────────────
-- Role is table-driven, never inferred from email domain. An @openhouse.in
-- address that is not in here is an ordinary candidate.
create table if not exists admins (
  email       text primary key,
  added_at    timestamptz not null default now()
);

-- ── submissions ───────────────────────────────────────────────────────
create table if not exists submissions (
  id             uuid primary key,
  email          text        not null,
  name           text,                       -- from the Google profile
  audio_key      text        not null,       -- R2 object key. Never a public URL
  audio_type     text,                       -- content type as uploaded
  audio_bytes    bigint,
  duration_s     numeric(8,2),               -- from Scribe, authoritative

  status         text        not null default 'queued',
      -- queued | processing | scored | failed | voided

  transcript     text,
  metrics        jsonb,
  scores         jsonb,
  rubric_version text,                       -- sha256(rubric.md)[:12]
  model          text,                       -- e.g. 'claude-opus-5'
  stt_model      text,                       -- e.g. 'scribe_v2'
  error          text,                       -- populated when status='failed'

  created_at     timestamptz not null default now(),
  scored_at      timestamptz,
  voided_at      timestamptz,
  voided_by      text
);

-- One live submission per candidate. 'voided' rows are excluded, which is the
-- entire retry mechanism: void the row, the candidate can upload again.
-- This index is what makes a double-clicked submit impossible at the database
-- level rather than the application level.
create unique index if not exists submissions_one_live
  on submissions (email)
  where status <> 'voided';

-- Admin board: newest first.
create index if not exists submissions_created_idx
  on submissions (created_at desc);

-- Startup sweep scans by status.
create index if not exists submissions_status_idx
  on submissions (status);
