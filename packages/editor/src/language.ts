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

// Semantic-token legend — index order must match FadeBasic.Export.Web's
// TokenTypeLegend (the encoded stream uses indexes into this list).
const TOKEN_TYPES = [
    'comment', 'keyword', 'function', 'method', 'macro',
    'parameter', 'struct', 'type', 'operator', 'number', 'string',
];

// Per-token colors (VS Code dark palette) — injected as CSS for the
// `.fade-token-<type>` classes the decorations carry.
const DARK_COLORS: Record<string, string> = {
    comment: '#6A9955', keyword: '#C586C0', function: '#DCDCAA', method: '#DCDCAA',
    macro: '#C586C0', parameter: '#9CDCFE', struct: '#4EC9B0', type: '#4EC9B0',
    operator: '#D4D4D4', number: '#B5CEA8', string: '#CE9178',
};

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

    monaco.editor.defineTheme('fade-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: TOKEN_TYPES.map((t) => ({ token: t, foreground: DARK_COLORS[t].slice(1) })),
        colors: {},
    });

    injectTokenCss();

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
        const name = TOKEN_TYPES[typeIdx] ?? 'unknown';
        decos.push({
            range: new monaco.Range(line + 1, ch + 1, line + 1, ch + 1 + len),
            options: { inlineClassName: 'fade-token-' + name },
        });
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

let cssInjected = false;
function injectTokenCss(): void {
    if (cssInjected || typeof document === 'undefined') return;
    cssInjected = true;
    const css = Object.entries(DARK_COLORS)
        .map(([t, c]) => `.fade-token-${t}{color:${c};}`)
        .join('\n') + '\n.fade-token-comment{font-style:italic;}';
    const style = document.createElement('style');
    style.setAttribute('data-fade-tokens', '');
    style.textContent = css;
    document.head.appendChild(style);
}
