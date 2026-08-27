-- Run once against Neon, then edit and re-run to add more.
-- There is deliberately no admin-management UI.
insert into admins (email) values
  ('support@openhouse.in')
on conflict (email) do nothing;
