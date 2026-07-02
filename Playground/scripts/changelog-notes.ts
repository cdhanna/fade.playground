// Emits release info from src/changelog.ts — the single source of truth for the
// Playground version + notes (also drives the in-app version popup). Used by the
// Deploy (production) workflow so the GitHub Release matches what shipped.
//
//   tsx scripts/changelog-notes.ts --version   → print the current version (top entry)
//   tsx scripts/changelog-notes.ts             → print the top entry's notes as Markdown
//
// An optional positional version pins a specific entry instead of the top one.

import { CHANGELOG, PLAYGROUND_VERSION, CHANGELOG_CATEGORIES } from '../src/changelog.ts';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) ?? PLAYGROUND_VERSION;

const entry = CHANGELOG.find((e) => e.version === target);
if (!entry) {
    console.error(`changelog-notes: no entry for version ${target}`);
    process.exit(1);
}

if (args.includes('--version')) {
    process.stdout.write(entry.version);
    process.exit(0);
}

const out: string[] = [];
for (const { key, label } of CHANGELOG_CATEGORIES) {
    const items = entry[key];
    if (Array.isArray(items) && items.length) {
        out.push(`### ${label}`);
        for (const line of items) out.push(`- ${line}`);
        out.push('');
    }
}
process.stdout.write(out.join('\n').trim() + '\n');
