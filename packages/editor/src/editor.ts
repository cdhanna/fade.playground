// createFadeEditor — a standalone monaco-editor bound to a @fadebasic/runtime
// FadeRunner: semantic-token highlighting + (optionally) live LSP diagnostics,
// pushing the document to the runner on every change.

import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import type { FadeRunner } from '@fadebasic/runtime';
import { attachFadeLanguage, applySemanticTokens, applyDiagnostics } from './language';

// Monaco needs a worker factory. Fade's intelligence comes from the runtime
// worker (not monaco's language workers), so the built-in editor worker is all
// we need — set once, guarded so multiple editors don't clobber it.
let envSet = false;
function ensureMonacoEnvironment(): void {
    if (envSet) return;
    envSet = true;
    (self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };
}

let uriCounter = 0;

export interface CreateFadeEditorOptions {
    runner: FadeRunner;
    /** Initial source. */
    value?: string;
    /** Read-only display (e.g. a doc fragment). Defaults diagnostics off. */
    readonly?: boolean;
    /** Live LSP diagnostics (red squiggles). Defaults to `!readonly`. */
    diagnostics?: boolean;
    /** Show the glyph margin (for breakpoint dots). Defaults to false. */
    glyphMargin?: boolean;
    /** Monaco theme id. Defaults to 'fade-dark'. */
    theme?: string;
    /** Resolves when the LSP worker is command-aware (project type set +
     *  command assemblies registered). The initial tokenize/diagnose waits for
     *  it so commands like `print` classify correctly instead of generically. */
    lspReady?: Promise<void>;
    /** Extra monaco editor options. */
    editorOptions?: monaco.editor.IStandaloneEditorConstructionOptions;
}

export interface FadeEditor {
    readonly editor: monaco.editor.IStandaloneCodeEditor;
    readonly model: monaco.editor.ITextModel;
    /** Current editor text. */
    getValue(): string;
    setValue(text: string): void;
    /** Subscribe to breakpoint-gutter clicks (1-based line numbers). */
    onBreakpointToggle(cb: (line: number) => void): void;
    /** Render the given (1-based) lines as breakpoint glyphs. */
    setBreakpointLines(lines: number[]): void;
    /** Highlight the paused line (1-based), or clear with null. */
    setCurrentLine(line: number | null): void;
    dispose(): void;
}

export function createFadeEditor(container: HTMLElement, opts: CreateFadeEditorOptions): FadeEditor {
    ensureMonacoEnvironment();
    attachFadeLanguage(opts.runner);

    const uri = monaco.Uri.parse(`file:///fade-${++uriCounter}.fbasic`);
    const model = monaco.editor.createModel(opts.value ?? '', 'fade', uri);
    const wantDiagnostics = opts.diagnostics ?? !opts.readonly;

    ensureDebugCss();
    const editor = monaco.editor.create(container, {
        model,
        theme: opts.theme ?? 'fade-dark',
        readOnly: opts.readonly ?? false,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        glyphMargin: opts.glyphMargin ?? false,
        fontSize: 14,
        ...opts.editorOptions,
    });

    let bpDecos: string[] = [];
    let curLineDecos: string[] = [];

    let decorations: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
        opts.runner.setDocument(uri.toString(), model.getValue());
        decorations = await applySemanticTokens(opts.runner, model, decorations);
        if (wantDiagnostics) await applyDiagnostics(opts.runner, model);
    };

    // Initial pass — wait until the LSP is command-aware so the first tokenize
    // classifies commands correctly (else e.g. `print` colors generically).
    void (opts.lspReady ?? Promise.resolve()).then(refresh);

    const sub = model.onDidChangeContent(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 250);
    });

    return {
        editor,
        model,
        getValue: () => model.getValue(),
        setValue: (text: string) => model.setValue(text),
        onBreakpointToggle: (cb) => {
            editor.onMouseDown((e) => {
                if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position) {
                    cb(e.target.position.lineNumber);
                }
            });
        },
        setBreakpointLines: (lines) => {
            bpDecos = editor.deltaDecorations(bpDecos, lines.map((ln) => ({
                range: new monaco.Range(ln, 1, ln, 1),
                options: { glyphMarginClassName: 'fade-bp', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
            })));
        },
        setCurrentLine: (line) => {
            curLineDecos = editor.deltaDecorations(curLineDecos, line == null ? [] : [{
                range: new monaco.Range(line, 1, line, 1),
                options: { isWholeLine: true, className: 'fade-current-line', glyphMarginClassName: 'fade-current-line-glyph' },
            }]);
            if (line != null) editor.revealLineInCenterIfOutsideViewport(line);
        },
        dispose: () => {
            if (timer) clearTimeout(timer);
            sub.dispose();
            editor.dispose();
            model.dispose();
        },
    };
}

let debugCssInjected = false;
function ensureDebugCss(): void {
    if (debugCssInjected || typeof document === 'undefined') return;
    debugCssInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-fade-debug', '');
    style.textContent = `
.monaco-editor .fade-bp { background: radial-gradient(circle, #e51400 45%, transparent 50%); cursor: pointer; }
.monaco-editor .fade-current-line { background: rgba(255, 221, 51, 0.14); }
.monaco-editor .fade-current-line-glyph { background: radial-gradient(circle, #ffcc00 45%, transparent 50%); }
`;
    document.head.appendChild(style);
}
