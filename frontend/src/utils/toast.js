// Failures and invisible effects only. Never a success toast for an effect the
// user can already see — a completed upload shows the stamp, so it gets none.

let seq = 0;
let items = [];
const subs = new Set();

function emit() { subs.forEach((fn) => fn(items)); }

export function subscribe(fn) {
  subs.add(fn);
  fn(items);
  return () => subs.delete(fn);
}

export function toast(message, kind = 'info', ttl = 5000) {
  const id = ++seq;
  items = [...items, { id, message, kind }];
  emit();
  setTimeout(() => dismiss(id), ttl);
  return id;
}

export function dismiss(id) {
  items = items.filter((t) => t.id !== id);
  emit();
}
