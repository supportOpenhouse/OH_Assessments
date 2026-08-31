// Every class a component uses must have a rule in styles.css.
//
// This exists because a block-replace in styles.css has twice silently deleted
// rules that components still referenced — once the brand lockup, once the whole
// activity filter bar. Both shipped looking broken and were only caught by eye.
//
//   node scripts/check-classes.mjs
//
// Not a linter. It answers one question: is anything referenced but undefined?

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname;
const css = readFileSync(join(SRC, 'styles.css'), 'utf8');

// Classes that are legitimately defined elsewhere or applied by a third party.
const EXTERNAL = new Set(['nsm7Bb-HzV7m-LgbsSe']); // Google's sign-in button

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.jsx') ? [p] : [];
});

const defined = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));

const missing = new Map();
for (const file of walk(SRC)) {
  const code = readFileSync(file, 'utf8');
  // className="a b" and className={`a ${x}`} — the literal runs only.
  for (const m of code.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const literal = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ');
    for (const cls of literal.split(/\s+/).filter(Boolean)) {
      // `foo-${x}` leaves the stub "foo-" once the expression is stripped.
      // That is a dynamic name, not a declared class.
      if (cls.endsWith('-')) continue;
      if (!defined.has(cls) && !EXTERNAL.has(cls)) {
        if (!missing.has(cls)) missing.set(cls, new Set());
        missing.get(cls).add(file.replace(SRC, 'src'));
      }
    }
  }
}

if (missing.size === 0) {
  console.log(`✓ every class used in JSX has a rule in styles.css (${defined.size} defined)`);
  process.exit(0);
}
console.error(`✗ ${missing.size} class(es) used but not defined in styles.css:\n`);
for (const [cls, files] of [...missing].sort()) {
  console.error(`  .${cls}\n      ${[...files].join('\n      ')}`);
}
process.exit(1);
