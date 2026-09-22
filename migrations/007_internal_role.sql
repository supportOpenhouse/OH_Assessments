-- 007 — a second staff role, `internal`.
--
-- Openhouse staff who work the submissions and candidates boards like an admin
-- but are NOT admins: the activity log is the one admin-only surface, for now.
-- Role is read from oh_users on every request (auth.current_user), so granting
-- or revoking it takes effect on that person's next request, not in a week.
--
-- `reviewer` stays in the list: it was in the original constraint and nothing
-- uses it, but dropping it would fail this migration outright if any row holds
-- it. Idempotent — safe to re-run.
--
-- Also folded into 001_schema.sql, the baseline for a fresh database.

alter table oh_users drop constraint if exists oh_users_role_valid;
alter table oh_users
  add constraint oh_users_role_valid check (role in ('admin', 'reviewer', 'internal'));

-- To give someone the role (an @openhouse.in address must be in oh_users to sign
-- in at all):
--   insert into oh_users (email, name, role) values ('name@openhouse.in', 'Name', 'internal')
--   on conflict (email) do update set role = 'internal', is_active = true;
