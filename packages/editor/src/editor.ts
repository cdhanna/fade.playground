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
    dispose(): void;
}

export function createFadeEditor(container: HTMLElement, opts: CreateFadeEditorOptions): FadeEditor {
    ensureMonacoEnvironment();
    attachFadeLanguage(opts.runner);

    const uri = monaco.Uri.parse(`file:///fade-${++uriCounter}.fbasic`);
    const model = monaco.editor.createModel(opts.value ?? '', 'fade', uri);
    const wantDiagnostics = opts.diagnostics ?? !opts.readonly;

    const editor = monaco.editor.create(container, {
        model,
        theme: opts.theme ?? 'fade-dark',
        readOnly: opts.readonly ?? false,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
        ...opts.editorOptions,
    });

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
        dispose: () => {
            if (timer) clearTimeout(timer);
            sub.dispose();
            editor.dispose();
            model.dispose();
        },
    };
}
