// Fade editor themes — extracted from the Playground. Each preset drives two
// things in lockstep:
//   1. The Monaco editor token theme (registered via defineTheme).
//   2. The static snippet token colors (<fade-code> / instant highlighter),
//      emitted as per-[data-theme] CSS so read-only snippets match the editor.
//
// The rest of the UI palette (page + component chrome: --bg/--fg/--border/…)
// lives as CSS variables in the consuming app, switched by [data-theme] on
// <html>. This module owns only the code-token colors.

import * as monaco from 'monaco-editor';

const TOKENS = ['comment', 'keyword', 'function', 'method', 'macro', 'parameter', 'struct', 'type', 'operator', 'number', 'string'] as const;
type TokenType = typeof TOKENS[number];

export interface FadeThemeDef {
    id: string;
    label: string;
    isDark: boolean;
    monaco: string;
    base: 'vs' | 'vs-dark' | 'hc-black';
    /** token type → hex (no leading #). method mirrors function, type mirrors struct. */
    tokens: Record<TokenType, string>;
    /** optional Monaco editor.* color overrides (background/foreground/…). */
    editor?: Record<string, string>;
}

// c=comment k=keyword f=function m=macro p=parameter s=struct(+type) o=operator n=number str=string
const mk = (c: string, k: string, f: string, m: string, p: string, s: string, o: string, n: string, str: string): Record<TokenType, string> =>
    ({ comment: c, keyword: k, function: f, method: f, macro: m, parameter: p, struct: s, type: s, operator: o, number: n, string: str });

export const FADE_THEMES: FadeThemeDef[] = [
    { id: 'dark', label: 'Dark (default)', isDark: true, monaco: 'fade-dark', base: 'vs-dark',
      tokens: mk('6A9955', 'C586C0', 'DCDCAA', 'C586C0', '9CDCFE', '4EC9B0', 'D4D4D4', 'B5CEA8', 'CE9178') },
    { id: 'light', label: 'Light', isDark: false, monaco: 'fade-light', base: 'vs',
      tokens: mk('008000', 'AF00DB', '795E26', 'AF00DB', '001080', '267F99', '000000', '098658', 'A31515') },
    { id: 'dracula', label: 'Dracula', isDark: true, monaco: 'fade-dracula', base: 'vs-dark',
      tokens: mk('6272A4', 'FF79C6', '50FA7B', 'FF79C6', 'FFB86C', '8BE9FD', 'F8F8F2', 'BD93F9', 'F1FA8C'),
      editor: { 'editor.background': '#282A36', 'editor.foreground': '#F8F8F2' } },
    { id: 'solarized-dark', label: 'Solarized Dark', isDark: true, monaco: 'fade-solarized-dark', base: 'vs-dark',
      tokens: mk('586E75', '859900', 'B58900', '859900', 'CB4B16', '2AA198', '93A1A1', 'D33682', '2AA198'),
      editor: { 'editor.background': '#002B36', 'editor.foreground': '#93A1A1' } },
    { id: 'monokai', label: 'Monokai', isDark: true, monaco: 'fade-monokai', base: 'vs-dark',
      tokens: mk('75715E', 'F92672', 'A6E22E', 'F92672', 'FD971F', '66D9EF', 'F8F8F2', 'AE81FF', 'E6DB74'),
      editor: { 'editor.background': '#272822', 'editor.foreground': '#F8F8F2' } },
    { id: 'nord', label: 'Nord', isDark: true, monaco: 'fade-nord', base: 'vs-dark',
      tokens: mk('4C566A', '81A1C1', '88C0D0', 'B48EAD', 'D08770', '8FBCBB', 'ECEFF4', 'B48EAD', 'A3BE8C'),
      editor: { 'editor.background': '#2E3440', 'editor.foreground': '#D8DEE9' } },
    { id: 'high-contrast', label: 'High Contrast', isDark: true, monaco: 'fade-high-contrast', base: 'hc-black',
      tokens: mk('7CA668', '569CD6', 'DCDCAA', 'C586C0', '9CDCFE', '4EC9B0', 'FFFFFF', 'B5CEA8', 'CE9178') },
    { id: 'dbp', label: 'Classic', isDark: false, monaco: 'fade-dbp', base: 'vs',
      tokens: mk('808080', '0000FF', '0000FF', '0000FF', '000000', '000000', '000000', '2E8B57', '800080'),
      editor: {
          'editor.background': '#FFFFFF', 'editor.foreground': '#000000',
          'editorLineNumber.foreground': '#A0A0A0', 'editorLineNumber.activeForeground': '#000000',
          'editor.selectionBackground': '#316AC5', 'editor.lineHighlightBackground': '#F4F4F4',
      } },
];

/** Lightweight preset list for building a theme picker. */
export const FADE_THEME_PRESETS = FADE_THEMES.map(({ id, label, isDark, monaco }) => ({ id, label, isDark, monaco }));

export function resolveFadeTheme(id: string): FadeThemeDef {
    return FADE_THEMES.find((t) => t.id === id) ?? FADE_THEMES[0];
}
export function fadeThemeIds(): string[] { return FADE_THEMES.map((t) => t.id); }

let registered = false;
/** Define every Fade Monaco theme (idempotent). */
export function ensureFadeThemes(): void {
    if (registered) return;
    registered = true;
    for (const t of FADE_THEMES) {
        try {
            monaco.editor.defineTheme(t.monaco, {
                base: t.base,
                inherit: true,
                rules: TOKENS.map((token) => ({ token, foreground: t.tokens[token], ...(token === 'comment' ? { fontStyle: 'italic' } : {}) })),
                colors: t.editor ?? {},
            });
        } catch { /* a theme may already be defined; ignore */ }
    }
}

// The active Monaco theme id. Monaco's theme is a GLOBAL setting, so a newly
// created editor must mount with this (not a hardcoded 'fade-dark') or it would
// reset every other editor's theme back to dark.
let activeMonaco = 'fade-dark';
export function activeFadeMonacoTheme(): string { return activeMonaco; }

/** Switch the active Monaco theme (global — reskins every mounted editor). */
export function setFadeTheme(monacoId: string): void {
    activeMonaco = monacoId;
    ensureFadeThemes();
    try { monaco.editor.setTheme(monacoId); } catch { /* not defined yet */ }
}

/** CSS for the code token colors, per [data-theme]. `dark` is the default (no
 *  selector); other themes scope under html[data-theme="<id>"]. Covers both the
 *  static-snippet spans (`.fade-tok-<type>`) and the Monaco editor's semantic-
 *  token decorations (`.monaco-editor .fade-token-<type>`, which need
 *  !important to beat monaco's default token color since fade has no grammar). */
export function fadeThemeTokenCss(): string {
    const rules: string[] = [];
    for (const t of FADE_THEMES) {
        const scope = t.id === 'dark' ? '' : `html[data-theme="${t.id}"] `;
        for (const token of TOKENS) {
            const c = `#${t.tokens[token]}`;
            rules.push(`${scope}.fade-tok-${token} { color: ${c}; }`);
            rules.push(`${scope}.monaco-editor .fade-token-${token} { color: ${c} !important; }`);
        }
        rules.push(`${scope}.fade-tok-comment, ${scope}.monaco-editor .fade-token-comment { font-style: italic; }`);
    }
    return rules.join('\n');
}

let cssInjected = false;
/** Inject the per-theme token CSS once. Safe to call from multiple entry points
 *  (attachFadeLanguage, injectSnippetCss). */
export function injectFadeThemeCss(): void {
    if (cssInjected || typeof document === 'undefined') return;
    cssInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-fade-theme-tokens', '');
    style.textContent = fadeThemeTokenCss();
    document.head.appendChild(style);
}
