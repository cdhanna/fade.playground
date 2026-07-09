// @fadebasic/components — framework-agnostic web components for embedding
// FadeBasic. Importing this module registers the custom elements.

import './fade-runnable';
import './fade-code';

export { FadeRunnableElement } from './fade-runnable';
export { FadeCodeElement } from './fade-code';
export { armWebPreview } from './web-preview';
export { getSharedRunner, getLspReady, getMonoLspReady, formatFadeSource } from './runner-pool';
export { FADE_THEME_PRESETS, resolveFadeTheme, fadeThemeIds, ensureFadeThemes, setFadeTheme, activeFadeMonacoTheme } from '@fadebasic/editor';
export { applyFadeTheme, getFadeTheme } from './theme';
