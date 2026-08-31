-- Run once against Neon. Re-run after editing to add more staff.
-- There is deliberately no user-management UI.
insert into oh_users (email, name, role) values
  ('support@openhouse.in', 'Openhouse Support', 'admin')
on conflict (email) do nothing;
