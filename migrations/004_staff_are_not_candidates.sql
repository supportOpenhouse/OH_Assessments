-- 004 · Staff no longer get a candidates row.
--
-- The rule is now: an @openhouse.in address that is not in oh_users is REFUSED
-- at sign-in, and one that IS in oh_users never gets a candidates row. Staff and
-- applicants are separate populations.
--
-- Existing staff rows created under the old behaviour are cleaned up here.
--
-- SAFETY: only rows with NO submissions are deleted. A staff member who actually
-- submitted something has real data hanging off that row — deleting it would
-- cascade the submission away. Those are left for a human to decide about, and
-- the SELECT at the end names them.

begin;

delete from candidates c
 where exists (select 1 from oh_users o where o.email = c.email)
   and not exists (select 1 from submissions s where s.candidate_id = c.id);

commit;

-- Anything left over: staff who hold submissions. Void or delete by hand.
select c.email, c.name, count(s.id) as submissions
  from candidates c
  join oh_users o on o.email = c.email
  left join submissions s on s.candidate_id = c.id
 group by c.email, c.name
 order by c.email;
