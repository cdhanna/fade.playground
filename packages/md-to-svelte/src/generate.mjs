#!/usr/bin/env node
// Turn a Markdown document into an ordered list of blocks — prose rendered to
// HTML, and Fade code blocks — so a UI (e.g. a Svelte page) can render prose
// with {@html} and code with <fade-runnable>. Emits a JSON data module, which
// dodges all HTML/JSX/Svelte brace-escaping in generated markup. Also emits a
// table of contents (HELP_TOC) built from the headings, and stamps matching
// `id` slugs onto the rendered headings so a UI can link/scroll to them.
//
// Fade code blocks are runnable by DEFAULT (all of them). Opt OUT per fence:
//   ```basic            → runnable "try it" snippet (Run + output)
//   ```basic norun      → display-only (highlighted, read-only)
//   ```basic invalid    → runnable, but keep diagnostics on (teach the error)
//
// Usage: fade-md-to-svelte <input.md> --out <output.js> [--title "…"]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { marked } from 'marked';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const out = outIdx !== -1 ? args[outIdx + 1] : null;
const titleIdx = args.indexOf('--title');
const title = titleIdx !== -1 ? args[titleIdx + 1] : null;

if (!input || !out) {
    console.error('usage: fade-md-to-svelte <input.md> --out <output.js> [--title "…"]');
    process.exit(1);
}

// GitHub-style heading slug: lowercase, drop punctuation, spaces → hyphens.
// Used for BOTH the heading `id` and the TOC link, so they always agree.
const slugify = (s) => s.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

// Stamp id slugs onto rendered headings. Dedupe so repeated heading text still
// yields unique, stable ids (foo, foo-1, foo-2 …) matching the TOC below.
const slugCounts = new Map();
const uniqueSlug = (text) => {
    const base = slugify(text);
    const n = slugCounts.get(base) ?? 0;
    slugCounts.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
};
// GitHub-style alert/callout labels. `> [!NOTE]` etc. render as plain
// blockquotes in vanilla marked; we upgrade them to styled callouts.
const ALERT_LABELS = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };

marked.use({
    renderer: {
        heading(token) {
            const inner = this.parser.parseInline(token.tokens);
            const slug = uniqueSlug(token.text);
            return `<h${token.depth} id="${slug}">${inner}</h${token.depth}>\n`;
        },
        blockquote(token) {
            // Strip the `> ` markers, then look for a leading `[!TYPE]` line.
            const body = token.raw.replace(/^ *> ?/gm, '');
            const m = body.match(/^\[!(note|tip|important|warning|caution)\][^\n]*\r?\n?/i);
            if (m) {
                const type = m[1].toLowerCase();
                // Re-parse the remainder as Markdown so nested lists/code/links
                // inside the callout render correctly.
                const inner = marked.parse(body.slice(m[0].length));
                return `<div class="fade-callout fade-callout--${type}">`
                    + `<div class="fade-callout__title">${ALERT_LABELS[type]}</div>`
                    + `<div class="fade-callout__body">${inner}</div></div>\n`;
            }
            return `<blockquote>${this.parser.parse(token.tokens)}</blockquote>\n`;
        },
    },
});

const src = readFileSync(resolve(input), 'utf8');
const tokens = marked.lexer(src);

// Build the TOC from headings (h1–h3). Slug dedupe mirrors uniqueSlug above:
// tokens are walked in document order, same as rendering, so slugs line up.
const tocCounts = new Map();
const toc = [];
for (const tok of tokens) {
    if (tok.type !== 'heading' || tok.depth > 3) continue;
    const base = slugify(tok.text);
    const n = tocCounts.get(base) ?? 0;
    tocCounts.set(base, n + 1);
    toc.push({ level: tok.depth, text: tok.text, slug: n === 0 ? base : `${base}-${n}` });
}

const blocks = [];
let proseBuf = [];
const flushProse = () => {
    if (!proseBuf.length) return;
    blocks.push({ type: 'html', html: marked.parser(proseBuf) });
    proseBuf = [];
};

// Hidden authoring hint: `<!-- fade:hint … -->` on its own line attaches
// instructive text to the NEXT code block (e.g. "add a PRINT / set a
// breakpoint"). It's an HTML comment, so GitHub renders nothing — the hint is
// only surfaced in the interactive Help UI.
let pendingHint = null;
let pendingCommands = null;
const HINT_RE = /<!--\s*fade:hint\s+([\s\S]*?)\s*-->/i;
// `<!-- fade:commands cls, sync, load image -->` — extra command words to
// highlight for the NEXT snippet, without loading the runtime that defines
// them. Split on commas/whitespace so multi-word commands contribute each word.
const CMD_RE = /<!--\s*fade:commands\s+([\s\S]*?)\s*-->/i;

for (const tok of tokens) {
    if (tok.type === 'html') {
        const raw = tok.raw || tok.text || '';
        const hm = raw.match(HINT_RE);
        if (hm) { pendingHint = hm[1].trim().replace(/\s+/g, ' '); continue; } // consume; don't render
        const cm = raw.match(CMD_RE);
        if (cm) { pendingCommands = cm[1].split(/[,\s]+/).map((w) => w.trim().toLowerCase()).filter(Boolean); continue; }
    }
    const lang = (tok.type === 'code' ? (tok.lang || '') : '').trim().toLowerCase();
    const isFade = lang === 'basic' || lang.startsWith('basic ');
    if (isFade) {
        flushProse();
        const flags = lang.split(/\s+/).slice(1);
        // Runnable by default; opt out with `norun` (also accept legacy `run`).
        blocks.push({
            type: 'code',
            code: tok.text,
            runnable: !flags.includes('norun'),
            invalid: flags.includes('invalid'),
            hint: pendingHint || undefined,
            commands: pendingCommands && pendingCommands.length ? pendingCommands : undefined,
        });
        pendingHint = null;
        pendingCommands = null;
    } else {
        proseBuf.push(tok);
    }
}
flushProse();

const runnable = blocks.filter((b) => b.type === 'code' && b.runnable).length;
const display = blocks.filter((b) => b.type === 'code' && !b.runnable).length;

const banner = `// AUTO-GENERATED by @fadebasic/md-to-svelte from ${input}. Do not edit.\n`;
const payload = `${banner}export const HELP_TITLE = ${JSON.stringify(title)};\n`
    + `export const HELP_TOC = ${JSON.stringify(toc, null, 0)};\n`
    + `export const HELP_BLOCKS = ${JSON.stringify(blocks, null, 0)};\n`;

mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), payload);
console.log(`[md-to-svelte] ${input} → ${out}: ${blocks.length} blocks (${runnable} runnable, ${display} display-only), ${toc.length} toc entries`);
