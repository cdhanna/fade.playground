// createFadeEditor — a standalone monaco-editor bound to a @fadebasic/runtime
// FadeRunner: semantic-token highlighting + (optionally) live LSP diagnostics,
// pushing the document to the runner on every change.

import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import type { FadeRunner } from '@fadebasic/runtime';
import { attachFadeLanguage, applySemanticTokens, applyDiagnostics } from './language';
import { activeFadeMonacoTheme } from './themes';

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
    /** Called after each diagnostics pass with the current error-marker count
     *  (0 = clean). Lets a host gate actions like Run/Debug on a compilable
     *  document. Only fires when diagnostics are enabled. */
    onDiagnostics?: (errorCount: number) => void;
    /** Fired exactly once, the moment the first semantic-token pass actually
     *  paints highlighting into the model (tokens applied, not just requested).
     *  The WASM LSP can take a few seconds to warm up, during which the code
     *  sits un-highlighted; hosts use this to clear a "loading language tools"
     *  affordance. Never fires for a document that produces no tokens. */
    onFirstTokens?: () => void;
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
    /** Rendered geometry, for aligning an external overlay (e.g. a loading
     *  skeleton) with the real gutter and line grid. `contentLeft` is where the
     *  code starts (past glyph margin + line numbers + decorations). */
    getLayoutMetrics(): { contentLeft: number; decorationsWidth: number; lineHeight: number; paddingTop: number };
    /** Fires on every re-layout (font load, resize, gutter-width change) so an
     *  overlay can re-sync its geometry. Returns a disposable. */
    onLayoutChange(cb: () => void): { dispose(): void };
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
        theme: opts.theme ?? activeFadeMonacoTheme(),
        readOnly: opts.readonly ?? false,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        // Let the page scroll when the editor has nothing (more) to scroll —
        // otherwise Monaco swallows the wheel and an embedded editor feels
        // "stuck" as you scroll past it.
        scrollbar: { alwaysConsumeMouseWheel: false },
        glyphMargin: opts.glyphMargin ?? false,
        // Keep the left gutter tight: these embedded snippets are short and
        // read-mostly, so we don't want a wide, mostly-dead margin. Reserve room
        // for ~3 line-number digits (not 5), drop the folding margin, and trim
        // the decoration gap — reclaiming that width for the code/debug area.
        // `selectOnLineNumbers: false` lets a click anywhere in the line-number
        // gutter toggle a breakpoint (see onBreakpointToggle) instead of
        // selecting the whole line, so the clickable target is the full gutter.
        lineNumbersMinChars: 3,
        folding: false,
        lineDecorationsWidth: 6,
        selectOnLineNumbers: false,
        fontSize: 14,
        // Match the static snippet highlighter (fade-code) exactly — same
        // family, size, and line box — so text that morphs from a snippet into
        // this editor doesn't shift metrics at the handoff.
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        lineHeight: 19,
        ...opts.editorOptions,
    });

    let bpDecos: string[] = [];
    let curLineDecos: string[] = [];
    // View-zone id for the "past the end" current-line marker (see setCurrentLine).
    let endZoneId: string | null = null;

    let decorations: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstTokensFired = false;

    const refresh = async () => {
        opts.runner.setDocument(uri.toString(), model.getValue());
        decorations = await applySemanticTokens(opts.runner, model, decorations);
        // Fire once, the first time tokens actually land on screen (non-empty
        // decoration set) — the signal a host uses to drop its "loading
        // language tools" banner.
        if (!firstTokensFired && decorations.length > 0) {
            firstTokensFired = true;
            opts.onFirstTokens?.();
        }
        if (wantDiagnostics) {
            await applyDiagnostics(opts.runner, model);
            if (opts.onDiagnostics && !model.isDisposed()) {
                const errors = monaco.editor
                    .getModelMarkers({ resource: uri, owner: 'fade' })
                    .filter((m) => m.severity === monaco.MarkerSeverity.Error).length;
                opts.onDiagnostics(errors);
            }
        }
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
                // The whole gutter — glyph margin AND line numbers — toggles a
                // breakpoint, so you don't have to hit a narrow strip on the far
                // left. (Line-number selection is disabled via selectOnLineNumbers.)
                const t = e.target.type;
                const inGutter =
                    t === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
                    t === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
                if (inGutter && e.target.position) cb(e.target.position.lineNumber);
            });
        },
        setBreakpointLines: (lines) => {
            bpDecos = editor.deltaDecorations(bpDecos, lines.map((ln) => ({
                range: new monaco.Range(ln, 1, ln, 1),
                options: { glyphMarginClassName: 'fade-bp', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
            })));
        },
        setCurrentLine: (line) => {
            // Clear any prior "past the end" zone before repainting.
            if (endZoneId != null) {
                const id = endZoneId;
                editor.changeViewZones((acc) => acc.removeZone(id));
                endZoneId = null;
            }
            // The program's final steppable stop (the compiler's trailing NOOP)
            // lands just past the last statement — which can be past the last line
            // of the model, or on a trailing blank/comment line. Either way it's
            // NOT a real code stop (comments/blank lines carry no bytecode, so the
            // debugger never legitimately pauses on one), so render it as an
            // "end of program" marker on a virtual line past the code rather than a
            // clamped/mid-file highlight.
            if (line != null && isNonCodeLine(model, line)) {
                curLineDecos = editor.deltaDecorations(curLineDecos, []);
                editor.changeViewZones((acc) => {
                    const dom = document.createElement('div');
                    dom.className = 'fade-current-endzone';
                    endZoneId = acc.addZone({ afterLineNumber: model.getLineCount(), heightInLines: 1, domNode: dom });
                });
                editor.revealLineInCenterIfOutsideViewport(model.getLineCount());
                return;
            }
            curLineDecos = editor.deltaDecorations(curLineDecos, line == null ? [] : [{
                range: new monaco.Range(line, 1, line, 1),
                options: { isWholeLine: true, className: 'fade-current-line', glyphMarginClassName: 'fade-current-line-glyph' },
            }]);
            if (line != null) editor.revealLineInCenterIfOutsideViewport(line);
        },
        getLayoutMetrics: () => {
            const info = editor.getLayoutInfo();
            return {
                contentLeft: info.contentLeft,
                decorationsWidth: info.decorationsWidth,
                lineHeight: editor.getOption(monaco.editor.EditorOption.lineHeight),
                // Vertical offset of the first line's top within the content
                // (any editor top padding), independent of scroll.
                paddingTop: editor.getTopForLineNumber(1) - editor.getScrollTop(),
            };
        },
        onLayoutChange: (cb) => editor.onDidLayoutChange(() => cb()),
        dispose: () => {
            if (timer) clearTimeout(timer);
            sub.dispose();
            editor.dispose();
            model.dispose();
        },
    };
}

// A blank or comment line is never a real step target (comments/blank lines
// carry no bytecode), so a debugger stop that lands on one is the program's
// synthetic end stop — used to decide when to render the "end of program"
// marker past the code instead of a normal current-line highlight.
function isNonCodeLine(model: monaco.editor.ITextModel, line: number): boolean {
    if (line > model.getLineCount()) return true;
    const text = model.getLineContent(line).trim();
    return text === '' || text.startsWith('`') || /^rem(start|end)?\b/i.test(text);
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
/* Current-line marker rendered on a virtual line PAST the last line of code
   (the program's final stop). A highlighted strip with a left accent + a faint
   label so it reads as "end of program". */
.fade-current-endzone {
    width: 100%; height: 100%; box-sizing: border-box;
    background: rgba(255, 221, 51, 0.14);
    box-shadow: inset 3px 0 0 #ffcc00;
    display: flex; align-items: center;
}
.fade-current-endzone::after {
    content: "end of program";
    margin-left: 10px; font-size: 11px; font-style: italic;
    color: rgba(255, 221, 51, 0.75);
}
/* The whole gutter — glyph margin AND line numbers — toggles breakpoints on
   click, so show a pointer across all of it (including empty lines). */
.monaco-editor .margin-view-overlays { cursor: pointer; }
.monaco-editor .margin-view-overlays .line-numbers { cursor: pointer; }
`;
    document.head.appendChild(style);
}
