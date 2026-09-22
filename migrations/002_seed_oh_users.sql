-- Run once against Neon: the FIRST admin, so someone can sign in at all.
-- Everyone after that is added from the admin Users page (/admin/users).
insert into oh_users (email, name, role) values
  ('support@openhouse.in', 'Openhouse Support', 'admin')
on conflict (email) do nothing;
