// Lightweight Fade snippet highlighting → HTML spans (no monaco). For static,
// auto-height code blocks (readonly doc fragments). Two layers:
//   highlightFadeStatic  — instant, dependency-free lexer (keywords/strings/
//                          numbers, + commands if a set is supplied)
//   renderTokenizedSnippet — upgrade with the LSP's semantic tokens (knows
//                            commands, structs, etc.)
// Ported from the Playground's snippet-highlight.ts so the Playground Help
// panel and the embeddable <fade-code> share one implementation.

import type { SnippetToken } from '@fadebasic/runtime';

// Semantic token type index → CSS class. Matches the LSP TokenTypeLegend order.
export const TOKEN_TYPE_CLASS: Record<number, string> = {
    0: 'fade-tok-comment', 1: 'fade-tok-keyword', 2: 'fade-tok-function',
    3: 'fade-tok-method', 4: 'fade-tok-macro', 5: 'fade-tok-parameter',
    6: 'fade-tok-struct', 7: 'fade-tok-type', 8: 'fade-tok-operator',
    9: 'fade-tok-number', 10: 'fade-tok-string',
};

const COLORS: Record<string, string> = {
    comment: '#6A9955', keyword: '#C586C0', function: '#DCDCAA', method: '#DCDCAA',
    macro: '#C586C0', parameter: '#9CDCFE', struct: '#4EC9B0', type: '#4EC9B0',
    operator: '#D4D4D4', number: '#B5CEA8', string: '#CE9178',
};

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function renderTokenizedSnippet(source: string, tokens: SnippetToken[]): string {
    if (tokens.length === 0) return escapeHtml(source);
    const lineStarts: number[] = [0];
    for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
    const spans: { start: number; end: number; type: number }[] = [];
    for (const t of tokens) {
        const lineStart = lineStarts[t.line];
        if (lineStart === undefined) continue;
        const start = lineStart + t.col;
        const end = start + t.length;
        if (end > source.length) continue;
        spans.push({ start, end, type: t.type });
    }
    spans.sort((a, b) => a.start - b.start);
    const cleaned: typeof spans = [];
    for (const s of spans) {
        if (cleaned.length > 0 && s.start < cleaned[cleaned.length - 1].end) continue;
        cleaned.push(s);
    }
    let out = '';
    let cursor = 0;
    for (const s of cleaned) {
        if (s.start > cursor) out += escapeHtml(source.slice(cursor, s.start));
        const cls = TOKEN_TYPE_CLASS[s.type] ?? 'fade-tok-default';
        out += `<span class="${cls}">${escapeHtml(source.slice(s.start, s.end))}</span>`;
        cursor = s.end;
    }
    if (cursor < source.length) out += escapeHtml(source.slice(cursor));
    return out;
}

const FADE_KEYWORDS = new Set([
    'if', 'then', 'else', 'elseif', 'endif', 'while', 'endwhile', 'for', 'to',
    'step', 'next', 'repeat', 'until', 'do', 'loop', 'exit', 'skip', 'select',
    'case', 'endcase', 'endselect', 'default', 'function', 'endfunction',
    'exitfunction', 'global', 'local', 'dim', 'as', 'type', 'endtype', 'gosub',
    'goto', 'return', 'and', 'or', 'not', 'mod', 'rem', 'remstart', 'remend',
    'end', 'true', 'false',
]);

/** Instant, dependency-free highlighter used before (or without) LSP tokens. */
export function highlightFadeStatic(source: string, commands?: ReadonlySet<string>): string {
    let out = '', i = 0;
    const n = source.length;
    while (i < n) {
        const c = source[i];
        if (c === '`') {
            let j = i; while (j < n && source[j] !== '\n') j++;
            out += `<span class="fade-tok-comment">${escapeHtml(source.slice(i, j))}</span>`; i = j;
        } else if (c === '"') {
            let j = i + 1; while (j < n && source[j] !== '"' && source[j] !== '\n') j++;
            if (j < n && source[j] === '"') j++;
            out += `<span class="fade-tok-string">${escapeHtml(source.slice(i, j))}</span>`; i = j;
        } else if (c >= '0' && c <= '9') {
            let j = i; while (j < n && /[0-9.]/.test(source[j])) j++;
            out += `<span class="fade-tok-number">${escapeHtml(source.slice(i, j))}</span>`; i = j;
        } else if (/[A-Za-z_]/.test(c)) {
            let j = i; while (j < n && /[A-Za-z0-9_$#]/.test(source[j])) j++;
            const word = source.slice(i, j), low = word.toLowerCase();
            if (FADE_KEYWORDS.has(low)) out += `<span class="fade-tok-keyword">${escapeHtml(word)}</span>`;
            else if (commands && commands.has(low)) out += `<span class="fade-tok-function">${escapeHtml(word)}</span>`;
            else out += escapeHtml(word);
            i = j;
        } else { out += escapeHtml(c); i++; }
    }
    return out;
}

let cssInjected = false;
/** Inject `.fade-tok-*` colors once. */
export function injectSnippetCss(): void {
    if (cssInjected || typeof document === 'undefined') return;
    cssInjected = true;
    const rules = Object.entries(COLORS).map(([t, c]) => `.fade-tok-${t}{color:${c};}`).join('\n')
        + '\n.fade-tok-comment{font-style:italic;}';
    const style = document.createElement('style');
    style.setAttribute('data-fade-snippet', '');
    style.textContent = rules;
    document.head.appendChild(style);
}
