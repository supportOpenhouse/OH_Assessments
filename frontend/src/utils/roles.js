// Mirrors backend/app/auth.py `STAFF_ROLES`. The SERVER enforces every one of
// these on every request; the client uses them only to decide what to SHOW, so
// drift here can hide a link or mis-route a page but can never grant access.
//
// `internal` is staff that works the Submissions and Candidates boards like an
// admin but is not one: the Activity log is the one admin-only page, for now.
export const isAdmin = (user) => user?.role === 'admin';
export const isStaff = (user) => user?.role === 'admin' || user?.role === 'internal';

// Where a signed-in visitor belongs. One redirect on sign-in, none afterwards.
// A candidate without a phone and resume on file goes to /candidate-info first
// (the server refuses a submission without them anyway). After that, one who
// has attempted anything lands on their record, not on a list of things to start.
export function homeFor(user) {
  if (isStaff(user)) return '/admin';
  if (!user.details_complete) return '/candidate-info';
  return user.submission_count > 0 ? '/history' : '/assessments';
}
