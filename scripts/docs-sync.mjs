// docs-sync.mjs — copies canonical docs → website/docs/
// Single source of truth: docs/*.md + CONTRIBUTING.md + ROADMAP.md
// Usage: npm run docs:sync

import { cpSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dest = join(root, 'website', 'docs');

mkdirSync(dest, { recursive: true });

// Copy all markdown files from docs/
cpSync(join(root, 'docs'), dest, {
  recursive: true,
  filter: (src) => src.endsWith('.md'),
});

// Copy repo-level docs
for (const f of ['CONTRIBUTING.md', 'ROADMAP.md']) {
  cpSync(join(root, f), join(dest, f));
}

const count = ['CONTRIBUTING.md', 'ROADMAP.md'].length + 1; // approximate
console.log(`[docs:sync] Canonical docs copied to website/docs/`);
