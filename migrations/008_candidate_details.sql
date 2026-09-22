-- 008 — candidate details: phone, resume, and what Claude read off the resume.
--
-- A candidate must give a phone number and a resume before taking an
-- assessment (POST /api/submissions refuses without both). One person, one
-- current resume, so these are columns on `candidates`, not a table.
--
-- The resume file is in its own private R2 bucket (R2_RESUME_BUCKET); only the
-- key is stored here and it never leaves the server.
--
-- `resume_insights_key` is the resume_key the insights were READ FROM. A
-- candidate may replace their resume at any time, but the insights are only
-- re-read when staff ask — so `resume_key <> resume_insights_key` is exactly
-- "the candidate has changed their resume since it was evaluated".
--
-- `resume_status` is null until the first read is attempted. The FIRST resume
-- upload claims that null and schedules a read; later uploads do not.
--
-- Idempotent — safe to re-run. Also folded into 001_schema.sql.

alter table candidates add column if not exists phone               text;
alter table candidates add column if not exists resume_key          text;
alter table candidates add column if not exists resume_uploaded_at  timestamptz;
alter table candidates add column if not exists resume_status       text;
alter table candidates add column if not exists resume_status_at    timestamptz;
alter table candidates add column if not exists resume_error        text;
alter table candidates add column if not exists resume_insights     jsonb;
alter table candidates add column if not exists resume_insights_key text;
alter table candidates add column if not exists resume_model        text;
alter table candidates add column if not exists resume_extracted_at timestamptz;

alter table candidates drop constraint if exists candidates_resume_status_valid;
alter table candidates
  add constraint candidates_resume_status_valid
  check (resume_status in ('processing', 'ready', 'failed'));
