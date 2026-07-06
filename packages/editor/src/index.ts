// @fadebasic/editor — standalone monaco-editor + the Fade language, wired to
// a @fadebasic/runtime FadeRunner. No VSCode workbench.

export { createFadeEditor } from './editor';
export type { FadeEditor, CreateFadeEditorOptions } from './editor';
export { attachFadeLanguage, applySemanticTokens, applyDiagnostics, setDebugHoverEvaluator } from './language';
export { renderTokenizedSnippet, highlightFadeStatic, injectSnippetCss, TOKEN_TYPE_CLASS } from './snippet';
