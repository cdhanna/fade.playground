// VM-crash UX, shared by the Playground and the embeddable <fade-runnable>.
// When a debug session emits REV_REQUEST_EXPLODE, the caller resolves the
// failing `insIndex` to a source line and calls showCrashOverlay(...). The
// overlay owns:
//   - A red whole-line decoration on the failing line (sibling of the yellow
//     paused-at-breakpoint style).
//   - A Monaco content widget below that line with the error message + Abort.
// State is module-scoped: one crash overlay at a time (one error per program).

import * as monaco from 'monaco-editor';

export type CrashErrorKind =
    | 'invalid-address' | 'divide-by-zero' | 'invalid-power' | 'invalid-memory-copy'
    | 'assert-failed' | 'system-error' | 'explode' | 'unknown';

export interface CrashOverlayArgs {
    editor: monaco.editor.IStandaloneCodeEditor;
    line: number;            // 1-based monaco line
    kind: CrashErrorKind;
    title: string;
    detail: string | null;
    isSystem?: boolean;
    onAbort: () => void;
}

export function summarizeCrash(rawMessage: string): {
    kind: CrashErrorKind; title: string; detail: string | null; inner: string; isSystem: boolean;
} {
    let inner = rawMessage ?? '';
    let isSystem = false;
    try {
        const parsed = JSON.parse(inner);
        if (parsed && typeof parsed.message === 'string') inner = parsed.message;
        if (parsed && typeof parsed.isSystem === 'boolean') isSystem = parsed.isSystem;
    } catch { /* not JSON, treat input as inner */ }

    const kind = detectCrashKind(inner);
    if (kind === 'system-error') isSystem = true;

    if (kind === 'system-error') return { kind, title: 'Internal runtime error', detail: stripPrefix(inner, 'system-error'), inner, isSystem };
    if (kind === 'invalid-address') {
        const m = /index=\[(-?\d+)\][^\]]*?min=\[(-?\d+)\][^\]]*?max=\[(-?\d+)\]/.exec(inner);
        if (m) return { kind, title: 'Array index out of bounds', detail: `Index ${m[1]} is outside the valid range ${m[2]}–${m[3]}.`, inner, isSystem };
        return { kind, title: 'Invalid memory access', detail: inner, inner, isSystem };
    }
    if (kind === 'divide-by-zero') return { kind, title: 'Divide by zero', detail: null, inner, isSystem };
    if (kind === 'invalid-power') return { kind, title: 'Invalid exponent', detail: stripPrefix(inner, 'invalid-power'), inner, isSystem };
    if (kind === 'invalid-memory-copy') return { kind, title: 'Invalid memory copy', detail: stripPrefix(inner, 'invalid-memory-copy'), inner, isSystem };
    if (kind === 'assert-failed') { const detail = stripPrefix(inner, /assert(ion)?-?failed/i); return { kind, title: 'Assertion failed', detail: detail || null, inner, isSystem }; }
    if (isSystem) return { kind: 'system-error', title: 'Internal runtime error', detail: inner || null, inner, isSystem: true };
    return { kind, title: 'Runtime error', detail: inner || null, inner, isSystem };
}

function stripPrefix(s: string, prefix: string | RegExp): string | null {
    const re = typeof prefix === 'string'
        ? new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[.:\\s]*', 'i')
        : new RegExp('^(?:' + prefix.source + ')[.:\\s]*', 'i');
    const tail = s.replace(re, '').trim();
    return tail.length > 0 ? tail : null;
}

const KIND_LABELS: Record<CrashErrorKind, string> = {
    'invalid-address': 'Invalid address', 'divide-by-zero': 'Divide by zero', 'invalid-power': 'Invalid power',
    'invalid-memory-copy': 'Invalid memory copy', 'assert-failed': 'Assertion failed', 'system-error': 'Internal error',
    'explode': 'Runtime error', 'unknown': 'Runtime error',
};

export function detectCrashKind(message: string): CrashErrorKind {
    const head = (message ?? '').trim().toLowerCase();
    if (head.startsWith('invalid-address')) return 'invalid-address';
    if (head.startsWith('divide-by-zero')) return 'divide-by-zero';
    if (head.startsWith('invalid-power')) return 'invalid-power';
    if (head.startsWith('invalid-memory-copy')) return 'invalid-memory-copy';
    if (head.startsWith('assert-failed') || head.startsWith('assertion')) return 'assert-failed';
    if (head.startsWith('system-error')) return 'system-error';
    if (head.startsWith('explode')) return 'explode';
    return 'unknown';
}

/** Failing instruction index from `ins=[N]` in the formatted message. */
export function extractInsIndex(message: string): number | null {
    const m = /\bins=\[(\d+)\]/.exec(message ?? '');
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
}

interface ActiveOverlay {
    editor: monaco.editor.IStandaloneCodeEditor;
    model: monaco.editor.ITextModel;
    decorationIds: string[];
    widget: monaco.editor.IContentWidget;
    modelDisposeListener: monaco.IDisposable | null;
}
let active: ActiveOverlay | null = null;

export function showCrashOverlay(args: CrashOverlayArgs): void {
    injectCrashCss();
    hideCrashOverlay();

    const { editor, line, kind, title, detail, onAbort } = args;
    const isSystem = args.isSystem === true || kind === 'system-error';
    const model = editor.getModel();
    if (!model) return;

    const kindLabel = isSystem ? `${KIND_LABELS[kind]} (internal)` : KIND_LABELS[kind];
    const hoverMd = detail ? `**${kindLabel}** — ${title}\n\n${detail}` : `**${kindLabel}** — ${title}`;
    const decorationIds = model.deltaDecorations([], [{
        range: new monaco.Range(line, 1, line, 1),
        options: {
            isWholeLine: true,
            className: isSystem ? 'fade-crashed fade-crashed-system' : 'fade-crashed',
            glyphMarginClassName: isSystem ? 'codicon codicon-bug fade-crashed fade-crashed-system' : 'codicon codicon-error fade-crashed',
            glyphMarginHoverMessage: { value: hoverMd },
        },
    }]);

    const domNode = document.createElement('div');
    domNode.className = isSystem ? 'fade-crash-zone fade-crash-zone-system' : 'fade-crash-zone';
    const inner = document.createElement('div');
    inner.className = 'fade-crash-zone-inner';
    const icon = document.createElement('span');
    icon.className = isSystem ? 'fade-crash-icon codicon codicon-bug' : 'fade-crash-icon codicon codicon-error';
    const textCol = document.createElement('div');
    textCol.className = 'fade-crash-text';
    if (isSystem) { const chip = document.createElement('span'); chip.className = 'fade-crash-system-chip'; chip.textContent = 'Internal error'; textCol.appendChild(chip); }
    const titleEl = document.createElement('div'); titleEl.className = 'fade-crash-title'; titleEl.textContent = title; textCol.appendChild(titleEl);
    if (detail) { const detailEl = document.createElement('div'); detailEl.className = 'fade-crash-detail'; detailEl.textContent = detail; textCol.appendChild(detailEl); }
    const abortBtn = document.createElement('button');
    abortBtn.type = 'button'; abortBtn.className = 'fade-crash-abort'; abortBtn.textContent = 'Abort';
    abortBtn.title = 'Stop the program and clear this error';
    abortBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onAbort(); });
    inner.append(icon, textCol, abortBtn);
    domNode.appendChild(inner);

    const widget: monaco.editor.IContentWidget = {
        getId: () => 'fade.crashOverlay',
        getDomNode: () => domNode,
        getPosition: () => ({
            position: { lineNumber: line, column: 1 },
            preference: [monaco.editor.ContentWidgetPositionPreference.BELOW, monaco.editor.ContentWidgetPositionPreference.ABOVE],
        }),
    };
    editor.addContentWidget(widget);
    const modelDisposeListener = model.onWillDispose(() => hideCrashOverlay());
    active = { editor, model, decorationIds, widget, modelDisposeListener };

    try { editor.revealLineInCenterIfOutsideViewport(line, monaco.editor.ScrollType.Smooth); } catch { /* editor may not be ready */ }
}

export function hideCrashOverlay(): void {
    if (!active) return;
    const { editor, model, decorationIds, widget, modelDisposeListener } = active;
    active = null;
    try { modelDisposeListener?.dispose(); } catch { /* ignore */ }
    try { model.deltaDecorations(decorationIds, []); } catch { /* model may be disposed */ }
    try { editor.removeContentWidget(widget); } catch { /* editor may be torn down */ }
}

export function hasActiveCrashOverlay(): boolean { return active !== null; }

let cssInjected = false;
function injectCrashCss(): void {
    if (cssInjected || typeof document === 'undefined') return;
    cssInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-fade-crash', '');
    style.textContent = `
.monaco-editor .fade-crashed { background: rgba(229, 20, 0, 0.18); }
.monaco-editor .fade-crashed::before { color: #e51400 !important; }
.fade-crash-zone { background: #1e1e1e; border: 1px solid rgba(229,20,0,0.85); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); color: #d4d4d4; box-sizing: border-box; overflow: hidden; min-width: 320px; max-width: 640px; pointer-events: auto; margin-top: 4px; }
.fade-crash-zone-inner { display: flex; align-items: center; gap: 0.7rem; padding: 0.5rem 0.9rem; box-sizing: border-box; }
.fade-crash-icon { color: #e51400; font-size: 1rem; flex: 0 0 auto; }
.fade-crash-text { display: flex; flex-direction: column; justify-content: center; gap: 1px; flex: 1; min-width: 0; }
.fade-crash-title { color: #eee; font-weight: 600; font-size: 0.82rem; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fade-crash-detail { color: #aaa; font-size: 0.72rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fade-crash-abort { flex: 0 0 auto; background: #c12010; color: #fff; border: 1px solid #e51400; padding: 0.3rem 0.95rem; border-radius: 3px; cursor: pointer; font: inherit; font-size: 0.78rem; font-weight: 600; pointer-events: auto; width: auto; }
.fade-crash-abort:hover { background: #e51400; border-color: #ff3018; }
.monaco-editor .fade-crashed-system { background: rgba(245,158,11,0.18) !important; }
.monaco-editor .fade-crashed-system::before { color: #f59e0b !important; }
.fade-crash-zone-system { border-color: rgba(245,158,11,0.85); }
.fade-crash-zone-system .fade-crash-icon { color: #f59e0b; }
.fade-crash-zone-system .fade-crash-abort { background: #b07009; border-color: #f59e0b; }
.fade-crash-zone-system .fade-crash-abort:hover { background: #f59e0b; border-color: #fbbf24; }
.fade-crash-system-chip { align-self: flex-start; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #f59e0b; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.45); padding: 1px 5px; border-radius: 3px; margin-bottom: 2px; }
`;
    document.head.appendChild(style);
}
