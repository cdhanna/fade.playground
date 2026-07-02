// "What's new" popup for Playground version bumps.
//
// On every boot, maybeShowChangelogPopup() compares the active
// PLAYGROUND_VERSION against the version this browser saw last (stored
// in localStorage under LAST_SEEN_KEY). If they differ, the modal
// renders just the latest release (with a "View full changelog" button
// for the rest) and commits the new pointer on dismiss. First-ever
// loads (no stored pointer) are silent — we set the pointer to the
// active version so the popup only fires for real upgrades, not for
// new users.
//
// The full history now lives in the Help panel's Changelog tab; both the
// popup's "View full changelog" button and the Diagnostics version row
// route there (see setFullChangelogOpener + main.ts), so this file no
// longer renders the complete list itself.

import { marked } from 'marked';
import {
    CHANGELOG,
    CHANGELOG_CATEGORIES,
    PLAYGROUND_VERSION,
    type ChangelogEntry,
} from './changelog';

// Same defensive scrub pattern used by markdown-preview.ts: input is
// authored by the Playground maintainer (not the end user), but a stray
// <script> in a changelog bullet shouldn't get a chance to run.
function scrubInlineHtml(html: string): string {
    return html
        .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
        .replace(/javascript:/gi, '');
}

// Parse one bullet as inline markdown. parseInline skips the
// paragraph wrapping `parse` adds, so `**bold** word` becomes
// `<strong>bold</strong> word` directly — exactly what we want
// inside an <li>.
function renderBulletMarkdown(source: string): string {
    try {
        const html = marked.parseInline(source, { async: false, gfm: true, breaks: false }) as string;
        return scrubInlineHtml(html);
    } catch {
        // Fall back to plain text if marked throws — better a dull
        // bullet than a broken popup.
        const div = document.createElement('div');
        div.textContent = source;
        return div.innerHTML;
    }
}

const LAST_SEEN_KEY = 'fade.playground.lastSeenVersion';

function readLastSeen(): string | null {
    try { return localStorage.getItem(LAST_SEEN_KEY); } catch { return null; }
}

function writeLastSeen(version: string): void {
    try { localStorage.setItem(LAST_SEEN_KEY, version); } catch { /* ignore */ }
}

// Entries strictly newer than `lastSeen`, matched by version-equality
// against the CHANGELOG array (which is ordered newest-first). If
// `lastSeen` isn't in the array — e.g. a stale localStorage value
// pointing at a long-trimmed version — we show everything; better to
// over-tell than to silently skip a real bump.
function entriesNewerThan(lastSeen: string): ChangelogEntry[] {
    const idx = CHANGELOG.findIndex(e => e.version === lastSeen);
    if (idx === -1) return CHANGELOG.slice();
    return CHANGELOG.slice(0, idx);
}

// Optional callback wired from main.ts. When set, the "What's new"
// popup shows a "View full changelog" button that dismisses the modal
// and invokes this — main.ts opens/activates the changelog dock panel.
// Kept as a module-level hook so version-popup stays free of any
// dockview/panel knowledge.
let openFullChangelog: (() => void) | null = null;
export function setFullChangelogOpener(fn: (() => void) | null): void {
    openFullChangelog = fn;
}

export function maybeShowChangelogPopup(): void {
    const lastSeen = readLastSeen();
    if (lastSeen === null) {
        // First boot on this browser — no upgrade story to tell. Stamp
        // the pointer so the next bump fires the modal naturally.
        writeLastSeen(PLAYGROUND_VERSION);
        return;
    }
    if (lastSeen === PLAYGROUND_VERSION) return;

    const entries = entriesNewerThan(lastSeen);
    if (entries.length === 0) {
        // lastSeen is ahead of PLAYGROUND_VERSION (downgrade), or no
        // diff to show. Re-sync the pointer rather than nag.
        writeLastSeen(PLAYGROUND_VERSION);
        return;
    }
    // Surface only the latest release in the popup — however many
    // versions the user skipped, the "What's new" card stays a single
    // entry and the "View full changelog" button links to the rest.
    // (entriesNewerThan is still what gates whether we pop at all.)
    showChangelogModal([CHANGELOG[0]], lastSeen);
}

// Build the DOM for one changelog entry (version header + grouped
// bullet lists). Shared by the "What's new" modal and the full
// changelog dock panel so both render entries identically. The
// returned <section> carries `data-version` so callers can locate a
// specific entry (e.g. to scroll it into view) without relying on a
// global element id that could collide across the two renderers.
export function renderChangelogEntry(entry: ChangelogEntry): HTMLElement {
    const section = document.createElement('section');
    section.className = 'changelog-entry';
    section.dataset.version = entry.version;

    const titleRow = document.createElement('div');
    titleRow.className = 'changelog-entry-title';
    const versionEl = document.createElement('span');
    versionEl.className = 'changelog-entry-version';
    versionEl.textContent = entry.version;
    const dateEl = document.createElement('span');
    dateEl.className = 'changelog-entry-date';
    dateEl.textContent = entry.date;
    titleRow.append(versionEl, dateEl);
    section.appendChild(titleRow);

    // Iterate categories in CHANGELOG_CATEGORIES order so the
    // rendered layout always reads Added → Changed → Fixed →
    // Removed → Notes regardless of object-literal key order.
    for (const cat of CHANGELOG_CATEGORIES) {
        const items = entry[cat.key];
        if (!items || items.length === 0) continue;

        const catBlock = document.createElement('div');
        catBlock.className = 'changelog-cat';

        const catTitle = document.createElement('div');
        catTitle.className = 'changelog-cat-title';
        catTitle.textContent = cat.label;
        catBlock.appendChild(catTitle);

        const list = document.createElement('ul');
        for (const item of items) {
            const li = document.createElement('li');
            // innerHTML is fed marked-parsed-then-scrubbed
            // output, never raw user input. See scrubInlineHtml.
            li.innerHTML = renderBulletMarkdown(item);
            list.appendChild(li);
        }
        catBlock.appendChild(list);
        section.appendChild(catBlock);
    }

    return section;
}

// Render `entries` into the static #changelog-overlay markup and wire
// dismiss handlers. `previous` is the version the user was last on
// (drives the "updated from X" subtitle); pass null to just show the
// active version with no "View full changelog" button.
export function showChangelogModal(entries: ChangelogEntry[], previous: string | null): void {
    const overlay = document.getElementById('changelog-overlay');
    const body = document.getElementById('changelog-body');
    const subtitle = document.getElementById('changelog-subtitle');
    const dismissBtn = document.getElementById('changelog-dismiss') as HTMLButtonElement | null;
    const viewFullBtn = document.getElementById('changelog-view-full') as HTMLButtonElement | null;
    if (!overlay || !body || !subtitle || !dismissBtn) return;

    subtitle.textContent = previous
        ? `Playground updated to ${PLAYGROUND_VERSION} (from ${previous})`
        : `Playground ${PLAYGROUND_VERSION}`;

    body.replaceChildren();
    for (const entry of entries) body.appendChild(renderChangelogEntry(entry));

    // Offer "View full changelog" whenever main.ts wired an opener and
    // we're showing an upgrade (previous set). The button routes to the
    // Help panel's Changelog tab.
    const canViewFull = !!openFullChangelog && previous !== null;
    if (viewFullBtn) viewFullBtn.hidden = !canViewFull;

    overlay.hidden = false;

    const dismiss = () => {
        overlay.hidden = true;
        writeLastSeen(PLAYGROUND_VERSION);
        document.removeEventListener('keydown', onKeyDown);
        overlay.removeEventListener('click', onBackdropClick);
        dismissBtn.removeEventListener('click', dismiss);
        viewFullBtn?.removeEventListener('click', onViewFull);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    const onBackdropClick = (e: MouseEvent) => { if (e.target === overlay) dismiss(); };
    const onViewFull = () => { dismiss(); openFullChangelog?.(); };

    dismissBtn.addEventListener('click', dismiss);
    if (viewFullBtn && canViewFull) viewFullBtn.addEventListener('click', onViewFull);
    overlay.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown);
    dismissBtn.focus();
}
