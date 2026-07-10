// Theme manager for embedders: switch the CSS-variable palette (data-theme on
// <html>) + the Monaco editor theme in lockstep, persisted to localStorage.
// Shared by the <fade-runnable> in-toolbar theme picker and any app-level picker
// so there's a single source of truth (and one storage key).

import { FADE_THEME_PRESETS, resolveFadeTheme, setFadeTheme, ensureFadeThemes } from '@fadebasic/editor';

export { FADE_THEME_PRESETS };
const KEY = 'fade-theme';

export function getFadeTheme(): string {
    try { return localStorage.getItem(KEY) || 'dark'; } catch { return 'dark'; }
}

/** Apply a theme app-wide. `dark` uses :root (no data-theme attr); others set
 *  html[data-theme="<id>"]. Also switches the (global) Monaco theme + persists. */
export function applyFadeTheme(id: string): string {
    ensureFadeThemes();
    const p = resolveFadeTheme(id);
    const root = document.documentElement;
    if (p.id === 'dark') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', p.id);
    setFadeTheme(p.monaco);
    try { localStorage.setItem(KEY, p.id); } catch { /* private mode */ }
    return p.id;
}
