// Fade language support for a standalone monaco-editor (NOT the VSCode
// workbench). Registers the `fade` language, a theme, semantic-token
// highlighting (as decorations, decoded from the LSP worker's token stream),
// and the core LSP providers (completion / hover / signature help), all wired
// to a @fadebasic/runtime FadeRunner. Single-document — no project machinery.
//
// Distilled from the Playground's main.ts fade setup (register/config/theme at
// ~1849, applySemanticTokens at ~2194, providers at ~2285).

import * as monaco from 'monaco-editor';
import type { FadeRunner } from '@fadebasic/runtime';
import { ensureFadeThemes, injectFadeThemeCss } from './themes';

// Semantic-token legend — index order must match FadeBasic.Export.Web's
// TokenTypeLegend (the encoded stream uses indexes into this list).
const TOKEN_TYPES = [
    'comment', 'keyword', 'function', 'method', 'macro',
    'parameter', 'struct', 'type', 'operator', 'number', 'string',
];

// The FadeBasic LSP tags a few reserved control words under a *color* semantic
// category rather than `keyword`: FUNCTION/ENDFUNCTION/EXITFUNCTION come back as
// `function` (yellow, like a function name) and TYPE/ENDTYPE come back as
// `struct` (the struct-name color). They're control keywords — force them to
// `keyword` so every reserved word reads consistently (purple). Keyed by the
// category the LSP assigns → the exact words to reclassify.
const FORCE_KEYWORD: Record<string, Set<string>> = {
    function: new Set(['FUNCTION', 'ENDFUNCTION', 'EXITFUNCTION']),
    struct: new Set(['TYPE', 'ENDTYPE']),
};

// Token colors are theme-driven and live in themes.ts (fadeThemeTokenCss),
// injected via injectFadeThemeCss() so the editor + static snippets recolor
// per [data-theme].

// Debug-hover: when a session is paused, the hover provider evaluates the
// hovered symbol through this callback and shows its live value. The component
// sets it on pause and clears it on resume/stop. Module-level (not per-editor)
// since only one debug session is active at a time across the shared runner.
type DebugHoverEval = (word: string) => Promise<{ value: string; type?: string } | null>;
let debugHoverEval: DebugHoverEval | null = null;
export function setDebugHoverEvaluator(fn: DebugHoverEval | null): void { debugHoverEval = fn; }

let attached = false;

/** Register the `fade` language, theme, token CSS, and LSP providers against
 *  the given runner. Idempotent — safe to call once per page. */
export function attachFadeLanguage(runner: FadeRunner): void {
    if (attached) return;
    attached = true;

    monaco.languages.register({ id: 'fade', extensions: ['.fbasic', '.fb'], aliases: ['Fade', 'FadeBasic'] });

    monaco.languages.setLanguageConfiguration('fade', {
        comments: { lineComment: '`', blockComment: ['remstart', 'remend'] },
        wordPattern: /[a-zA-Z_][a-zA-Z0-9_$#]*/,
        brackets: [['(', ')']],
        autoClosingPairs: [
            { open: '(', close: ')' },
            { open: '"', close: '"', notIn: ['string'] },
        ],
        surroundingPairs: [
            { open: '(', close: ')' },
            { open: '"', close: '"' },
        ],
    });

    ensureFadeThemes();
    injectFadeThemeCss();

    // ── LSP providers → runner ────────────────────────────────────────────
    monaco.languages.registerCompletionItemProvider('fade', {
        triggerCharacters: [' ', '.', '(', '=', '+', '*', '-', '/'],
        provideCompletionItems: async (model, position) => {
            const items = await runner.getCompletions(model.uri.toString(), position.lineNumber - 1, position.column - 1);
            const word = model.getWordUntilPosition(position);
            const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
            return {
                suggestions: items.map((it) => ({
                    label: it.label,
                    kind: it.kind as monaco.languages.CompletionItemKind,
                    insertText: it.insertText || it.label,
                    detail: it.detail,
                    documentation: it.documentation,
                    sortText: it.sortText,
                    filterText: it.filterText,
                    insertTextRules: it.insertTextFormat === 2
                        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                        : undefined,
                    range,
                })),
            };
        },
    });

    monaco.languages.registerHoverProvider('fade', {
        provideHover: async (model, position) => {
            // When a debug session is paused, show the hovered symbol's live
            // value first (VSCode behavior), then fall through to LSP hover.
            const word = model.getWordAtPosition(position);
            if (word && debugHoverEval) {
                try {
                    const v = await debugHoverEval(word.word);
                    if (v != null) {
                        return {
                            contents: [{ value: `**${word.word}** = \`${v.value}\`${v.type ? ` _(${v.type})_` : ''}` }],
                            range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
                        };
                    }
                } catch { /* fall through to LSP hover */ }
            }
            const info = await runner.getHover(model.uri.toString(), position.lineNumber - 1, position.column - 1);
            if (!info) return null;
            return {
                contents: [{ value: info.contents }],
                range: new monaco.Range(
                    info.range.start.line + 1, info.range.start.character + 1,
                    info.range.end.line + 1, info.range.end.character + 1,
                ),
            };
        },
    });

    monaco.languages.registerSignatureHelpProvider('fade', {
        signatureHelpTriggerCharacters: ['(', ','],
        provideSignatureHelp: async (model, position) => {
            const help = await runner.getSignatureHelp(model.uri.toString(), position.lineNumber - 1, position.column - 1);
            if (!help) return null;
            return {
                value: {
                    signatures: help.signatures.map((s) => ({
                        label: s.label,
                        documentation: s.documentation ?? undefined,
                        parameters: s.parameters.map((pp) => ({ label: pp.label, documentation: pp.documentation ?? undefined })),
                        activeParameter: s.activeParameter,
                    })),
                    activeSignature: help.activeSignature,
                    activeParameter: help.activeParameter,
                },
                dispose: () => {},
            };
        },
    });
}

/** Decode the runner's semantic-token stream for `model` and apply it as
 *  inline decorations. Returns the new decoration ids (pass back next time). */
export async function applySemanticTokens(
    runner: FadeRunner,
    model: monaco.editor.ITextModel,
    prev: string[],
): Promise<string[]> {
    const tokens = await runner.getTokens(model.uri.toString());
    if (model.isDisposed()) return prev;
    const decos: monaco.editor.IModelDeltaDecoration[] = [];
    let line = 0, ch = 0;
    for (let i = 0; i + 4 < tokens.length; i += 5) {
        const dLine = tokens[i], dChar = tokens[i + 1], len = tokens[i + 2], typeIdx = tokens[i + 3];
        if (dLine > 0) { line += dLine; ch = dChar; } else { ch += dChar; }
        let name = TOKEN_TYPES[typeIdx] ?? 'unknown';
        const range = new monaco.Range(line + 1, ch + 1, line + 1, ch + 1 + len);
        // Reclassify the handful of reserved words the LSP colors as a
        // function/struct *name* back to `keyword` (see FORCE_KEYWORD) so
        // FUNCTION/TYPE read purple like FOR/SELECT/CASE.
        if (FORCE_KEYWORD[name]?.has(model.getValueInRange(range).toUpperCase())) {
            name = 'keyword';
        }
        decos.push({ range, options: { inlineClassName: 'fade-token-' + name } });
    }
    return model.deltaDecorations(prev, decos);
}

/** LSP diagnostic severity (1=Error…4=Hint) → monaco marker severity. */
function markerSeverity(sev: number): monaco.MarkerSeverity {
    return sev === 1 ? monaco.MarkerSeverity.Error
        : sev === 2 ? monaco.MarkerSeverity.Warning
        : sev === 3 ? monaco.MarkerSeverity.Info
        : monaco.MarkerSeverity.Hint;
}

/** Fetch diagnostics for the model's current text and apply them as markers. */
export async function applyDiagnostics(runner: FadeRunner, model: monaco.editor.ITextModel): Promise<void> {
    let diags;
    try {
        diags = await runner.checkDocumentDiagnostics(model.uri.toString(), model.getValue());
    } catch {
        return; // worker slow / gone — leave existing markers
    }
    if (model.isDisposed()) return;
    monaco.editor.setModelMarkers(model, 'fade', diags.map((d) => ({
        severity: markerSeverity(d.severity),
        startLineNumber: d.range.start.line + 1,
        startColumn: d.range.start.character + 1,
        endLineNumber: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        message: d.message,
        code: d.code,
        source: d.source ?? 'fade',
    })));
}

