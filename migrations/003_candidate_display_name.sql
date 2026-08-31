-- 003 · Let a candidate set their own display name.
--
-- candidates.name has always come from the Google profile and been refreshed on
-- every sign-in. Once someone can edit it, that refresh becomes a bug: they
-- rename themselves, sign in the next day, and are silently reverted.
--
-- name_set_by_user is the flag the login upsert checks. It is a column rather
-- than a comparison against the Google name because "they changed it back to
-- what Google says" is a legitimate choice that must also stick.
--
-- Idempotent, like every numbered file here: safe to re-run.

alter table candidates
  add column if not exists name_set_by_user boolean not null default false;

alter table candidates
  add column if not exists name_updated_at timestamptz;
