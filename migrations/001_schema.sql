-- OpenHouse · Assessments
-- Apply to Neon:  psql "$DATABASE_URL" -f migrations/001_schema.sql
-- See migrations/README.md for the full run order.
--
--   oh_users                    who works here            (assessment-agnostic)
--   candidates                  who is assessed           (assessment-agnostic)
--   submissions                 EVERY submission, of any  (assessment-agnostic)
--                               type — the holder
--   sales_insight_submissions   what is specific to the   (per assessment type)
--                               audio assessment
--   activity_logs               the audit trail           (assessment-agnostic)
--
-- submissions and sales_insight_submissions are a parent/child pair sharing a
-- primary key. The parent owns everything common to any assessment (who, which
-- type, status, headline score, timestamps); the child owns only what an AUDIO
-- assessment needs (audio, transcript, per-axis scores).
--
-- Nothing is duplicated between them, so nothing can drift. "Show me every
-- submission across every assessment" is `select * from submissions` — no UNION.

-- ══════════════════════════════════════════════════════════════════════════
-- Preflight
-- ══════════════════════════════════════════════════════════════════════════
--
-- `create table if not exists` does nothing when a table of that name already
-- exists — even if its SHAPE is completely different. The create is skipped
-- silently and the failure surfaces several statements later as an
-- incomprehensible "column does not exist".
--
-- That is exactly how this schema broke once: an older two-table `submissions`
-- (keyed on email, no candidate_id) was already in the database, the create was
-- skipped, and the index on (candidate_id, assessment_type) failed with 42703.
--
-- So: check the shape of everything up front and refuse to run on a mismatch.
do $preflight$
declare
  problems text := '';
  fix_note constant text :=
    'Run migrations/inspect.sql to see what is there and how many rows it holds. '
    || 'If none of it is real candidate data: migrations/reset.sql (DESTRUCTIVE), '
    || 'then 001_schema.sql, then 002_seed_oh_users.sql.';
begin
  -- Legacy table from the original two-table design.
  if to_regclass('public.admins') is not null then
    problems := problems
      || E'\n  - `admins` exists (it is `oh_users` in the current schema)';
  end if;

  -- Legacy `submissions`: keyed on email, no candidate_id. This is the exact
  -- shape that produced "column candidate_id does not exist" (SQLSTATE 42703).
  if to_regclass('public.submissions') is not null
     and not exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'submissions'
          and column_name = 'candidate_id')
  then
    problems := problems
      || E'\n  - `submissions` exists but has no `candidate_id` (legacy two-table shape)';
  end if;

  -- Legacy `sales_insight_submissions`: the standalone three-table version
  -- carried candidate_id and status. The current child carries neither — they
  -- moved to the parent.
  if to_regclass('public.sales_insight_submissions') is not null
     and exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'sales_insight_submissions'
          and column_name in ('candidate_id', 'status'))
  then
    problems := problems
      || E'\n  - `sales_insight_submissions` still has candidate_id/status (both moved to the parent)';
  end if;

  -- RAISE uses % as the placeholder, not %s. Getting that wrong mangles the one
  -- message whose entire job is to be readable.
  if problems <> '' then
    raise exception E'schema.sql will not run on this database:\n%\n\n%',
      problems, fix_note;
  end if;
end
$preflight$;

-- ── oh_users ──────────────────────────────────────────────────────────────
-- OpenHouse staff. Membership here is what grants elevated access — it is never
-- inferred from an email domain. An @openhouse.in address that is not in this
-- table is an ordinary candidate.
--
-- Referenced by nothing. Which staff member did what is an EVENT, recorded in
-- activity_logs, not a column on the thing they touched.
create table if not exists oh_users (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null unique,
  name        text,
  role        text        not null default 'admin',
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),

  constraint oh_users_role_valid check (role in ('admin', 'reviewer'))
);

-- ── candidates ────────────────────────────────────────────────────────────
-- One row per person for their whole relationship with OpenHouse, not per
-- assessment. Upserted on EVERY sign-in, staff included: the email is recorded
-- the moment someone logs in, before they do anything else.
--
-- NOTE ON THE NAME: this is the IDENTITY table — everyone who signs in, which
-- includes Openhouse staff, because it is the foreign-key target for every
-- submission and an admin testing the flow needs a row. It is NOT "the list of
-- applicants": that question is answered by the Candidates page, which excludes
-- anyone in oh_users. Do not delete staff rows to make that page look right —
-- filter the query instead, or the FK breaks the moment an admin submits.
create table if not exists candidates (
  id               uuid primary key default gen_random_uuid(),
  email            text        not null unique,
  name             text,

  -- Set true once the person edits their own name. The sign-in upsert checks it
  -- and stops refreshing `name` from the Google profile — otherwise a rename is
  -- silently reverted on their next login.
  name_set_by_user boolean     not null default false,
  name_updated_at  timestamptz,

  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  login_count      integer     not null default 0
);

-- ── submissions ───────────────────────────────────────────────────────────
-- THE HOLDER. Every submission to every assessment type, present and future,
-- has a row here. Only columns that are true of ANY assessment live here — if a
-- column would be null for a written assessment, it belongs in a child table.
create table if not exists submissions (
  -- Supplied by the application, not defaulted: this id is also the child row's
  -- id and, for audio assessments, the R2 object key.
  id              uuid        primary key,
  candidate_id    uuid        not null references candidates(id) on delete cascade,

  -- Which assessment. A new type adds a value here and one child table.
  assessment_type text        not null,

  status          text        not null default 'queued',

  -- 0-5 on the shared band scale, mirrored up from whichever child table holds
  -- the detailed scores. Maintained by trigger — see sync_overall_stars below.
  -- Lets the cross-assessment board rank without knowing any child's shape.
  overall_stars   smallint,

  error           text,                   -- populated when status = 'failed'

  created_at      timestamptz not null default now(),
  scored_at       timestamptz,
  voided_at       timestamptz,

  constraint submissions_status_valid
    check (status in ('queued', 'processing', 'scored', 'failed', 'voided')),
  constraint submissions_stars_valid
    check (overall_stars is null or overall_stars between 0 and 5),
  constraint submissions_type_valid
    check (assessment_type in ('sales_insight'))
);

-- One live submission per candidate PER ASSESSMENT TYPE. Now that the parent
-- carries the type, this single index covers every assessment there will ever
-- be — a candidate can take sales_insight once AND a future assessment once.
-- Voided rows are excluded, which is the entire retry mechanism.
create unique index if not exists submissions_one_live
  on submissions (candidate_id, assessment_type)
  where status <> 'voided';

create index if not exists submissions_created_idx
  on submissions (assessment_type, created_at desc);

-- The startup sweep scans by status.
create index if not exists submissions_status_idx
  on submissions (status);

create index if not exists submissions_candidate_idx
  on submissions (candidate_id);

-- ── sales_insight_submissions ─────────────────────────────────────────────
-- The audio assessment's own columns, and nothing else. No status, no
-- candidate_id, no timestamps — those are the parent's, and duplicating them is
-- exactly the drift this design exists to prevent.
create table if not exists sales_insight_submissions (
  -- Same value as the parent. PK and FK at once, so a child cannot exist
  -- without its parent and cannot outlive it.
  id             uuid primary key references submissions(id) on delete cascade,

  audio_key      text        not null,   -- R2 object key. Never a public URL
  audio_type     text,
  audio_bytes    bigint,
  duration_s     numeric(8,2),           -- from Scribe, authoritative

  transcript     text,
  metrics        jsonb,
  scores         jsonb,                  -- per-axis; shape belongs to the rubric
  rubric_version text,                   -- sha256(rubric.md)[:12]
  model          text,
  stt_model      text
);

-- ── the two triggers ──────────────────────────────────────────────────────

-- 1. A child row may only attach to a parent of the MATCHING assessment type.
--    The foreign key guarantees a parent exists; it cannot guarantee the parent
--    is the right kind. Without this, a bug could file an audio submission
--    under a written assessment and every later query would quietly disagree.
create or replace function sales_insight_guard_parent() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from submissions
     where id = new.id and assessment_type = 'sales_insight'
  ) then
    raise exception
      'submissions row % is absent or is not assessment_type = ''sales_insight''', new.id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_insight_parent_guard on sales_insight_submissions;
create trigger sales_insight_parent_guard
  before insert or update of id on sales_insight_submissions
  for each row execute function sales_insight_guard_parent();

-- 2. Mirror the headline score up to the parent whenever the child's scores
--    change. This is the ONE genuinely derived value in the design: the parent
--    needs a rankable number for the cross-assessment board, and only the child
--    knows the rubric's shape.
--
--    A trigger rather than application code on purpose — a score written by a
--    backfill, a migration, or a hand-run UPDATE has to reach the parent too.
create or replace function sales_insight_sync_overall() returns trigger
language plpgsql as $$
begin
  update submissions
     set overall_stars = (new.scores -> 'overall' ->> 'stars')::smallint
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists sales_insight_overall_sync on sales_insight_submissions;
create trigger sales_insight_overall_sync
  after insert or update of scores on sales_insight_submissions
  for each row execute function sales_insight_sync_overall();

-- ── activity_logs ─────────────────────────────────────────────────────────
-- Append-only audit trail. Every action that changes, creates or removes data
-- lands here, plus every sign-in.
--
-- Written server-side only. Client-side event tracking would miss anything that
-- does not go through the UI and can be forged by the person being audited;
-- every mutation in this product goes through the API, so the API is the
-- complete and trustworthy record.
--
-- Nothing here is ever updated or deleted. There is no UPDATE statement against
-- this table anywhere in the codebase.
create table if not exists activity_logs (
  id           bigserial   primary key,
  at           timestamptz not null default now(),

  actor_email  text,                     -- null only for system actions
  actor_role   text,                     -- user | admin | system

  action       text        not null,     -- 'submission.voided', 'auth.login', …
  entity       text,                     -- 'submission' | 'candidate'
  entity_id    text,

  -- What changed. Never contains a transcript, a score, or audio — those live on
  -- the row they belong to; duplicating them here would double the surface that
  -- can leak a result.
  data         jsonb,

  ip           text,
  user_agent   text
);

create index if not exists activity_logs_at_idx     on activity_logs (at desc);
create index if not exists activity_logs_actor_idx  on activity_logs (actor_email, at desc);
create index if not exists activity_logs_action_idx on activity_logs (action, at desc);
create index if not exists activity_logs_entity_idx on activity_logs (entity_id, at desc);


-- ══════════════════════════════════════════════════════════════════════════
-- Adding a new assessment type
-- ══════════════════════════════════════════════════════════════════════════
--
-- 1. Add the value to submissions_type_valid:
--      alter table submissions drop constraint submissions_type_valid;
--      alter table submissions add constraint submissions_type_valid
--        check (assessment_type in ('sales_insight', 'marketing_pitch'));
--
-- 2. Create its child table. Only what is SPECIFIC to it — a written assessment
--    has no audio_key and no duration_s:
--      create table marketing_pitch_submissions (
--        id uuid primary key references submissions(id) on delete cascade,
--        ... its own columns ...
--      );
--
-- 3. Copy both triggers, renaming 'sales_insight' to the new type.
--
-- 4. Copy the child-table functions in backend/app/db.py, add its rubric, its
--    routes, its admin page, and its action verbs in backend/app/logs.py.
--
-- Nothing else changes. submissions_one_live already scopes per type, the
-- cross-assessment board already reads from submissions, and no existing data
-- moves.
