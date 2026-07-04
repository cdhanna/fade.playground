// <fade-runnable> — an editable Fade snippet with Run, an output surface, and
// (with the `debug` attribute) a VSCode-style debugger: breakpoint gutter, step
// controls, and collapsible Variables / Call Stack / Breakpoints sections plus a
// Debug Console REPL. Framework-agnostic custom element; many per page.
//
// Source is taken from the `code` property (preferred for generated pages —
// dodges HTML/JSX brace parsing) or the element's text content (hand-authored).
// Attributes: asset-base (default '/runtime/'), readonly, autorun, no-run, debug.

import { FadeRunner } from '@fadebasic/runtime';
import { createFadeEditor, type FadeEditor } from '@fadebasic/editor';
import { armWebPreview } from './web-preview';
import { getSharedRunner, getLspReady } from './runner-pool';

interface StackFrame { name: string; lineNumber: number; colNumber: number }

export class FadeRunnableElement extends HTMLElement {
    private runner?: FadeRunner;
    private fadeEditor?: FadeEditor;
    private iframe?: HTMLIFrameElement;
    private statusEl?: HTMLElement;
    private runBtn?: HTMLButtonElement;
    private armed = false;
    private running = false;
    private _code?: string;

    // Debug state
    private debugEnabled = false;
    private debugging = false;
    private paused = false;
    private breakpoints = new Set<number>(); // 1-based lines
    private frames: StackFrame[] = [];
    private activeFrame = 0;
    private debugBar?: HTMLElement;
    private stepBtns: HTMLButtonElement[] = [];
    private debugPane?: HTMLElement;
    private varsBody?: HTMLElement;
    private framesBody?: HTMLElement;
    private bpBody?: HTMLElement;
    private replLog?: HTMLElement;
    private replInput?: HTMLInputElement;

    /** Preferred way to set source from generated code (no HTML escaping). */
    get code(): string { return this.fadeEditor?.getValue() ?? this._code ?? ''; }
    set code(v: string) {
        this._code = v;
        if (this.fadeEditor) this.fadeEditor.setValue(v);
    }

    connectedCallback(): void {
        if (this.fadeEditor) return; // already mounted
        injectStyles();
        const source = this._code ?? this.getAttribute('code') ?? dedent(this.textContent ?? '');
        const assetBase = this.getAttribute('asset-base') ?? '/runtime/';
        const readonly = this.hasAttribute('readonly');
        const noRun = this.hasAttribute('no-run');
        this.debugEnabled = this.hasAttribute('debug') && !noRun && !readonly;

        this.textContent = '';
        this.classList.add('fade-runnable');

        const editorHost = el('div', 'fade-runnable__editor');
        const toolbar = el('div', 'fade-runnable__toolbar');
        this.statusEl = el('div', 'fade-runnable__status');
        this.append(editorHost, toolbar, this.statusEl);

        this.runner = getSharedRunner(assetBase);
        this.fadeEditor = createFadeEditor(editorHost, {
            runner: this.runner,
            value: source,
            readonly,
            diagnostics: !readonly,
            glyphMargin: this.debugEnabled,
            lspReady: getLspReady(this.runner, assetBase),
        });

        if (!noRun) {
            // The runtime renders program output inside the preview iframe — it
            // is the output surface.
            this.iframe = document.createElement('iframe');
            this.iframe.className = 'fade-runnable__vm';
            this.iframe.setAttribute('title', 'Fade output');
            this.append(this.iframe);

            this.runBtn = mkBtn('fade-runnable__run', '▶ Run', 'Run (⌘R)', () => void this.run());
            toolbar.append(this.runBtn);
            if (this.debugEnabled) this.setupDebug(toolbar);
            if (this.hasAttribute('autorun')) void this.run();
        }
    }

    disconnectedCallback(): void {
        this.fadeEditor?.dispose();
        this.fadeEditor = undefined;
    }

    // ── Run ────────────────────────────────────────────────────────────────
    async run(): Promise<void> {
        if (this.running || !this.runner || !this.iframe) return;
        this.running = true;
        if (this.runBtn) { this.runBtn.disabled = true; this.runBtn.textContent = '… Running'; }
        this.setStatus('', 'out');
        try {
            if (!this.armed) {
                this.setStatus('Loading runtime…', 'out');
                await armWebPreview(this.runner, this.iframe, this.assetBase());
                this.armed = true;
                this.setStatus('', 'out');
            }
            const result = JSON.parse(await this.runner.run(this.fadeEditor!.getValue()));
            if (result.compileError) this.setStatus(result.compileError, 'error');
            else if (result.ok === false && result.error) this.setStatus(result.error, 'error');
        } catch (e) {
            this.setStatus(e instanceof Error ? e.message : String(e), 'error');
        } finally {
            this.running = false;
            if (this.runBtn) { this.runBtn.disabled = false; this.runBtn.textContent = '▶ Run'; }
        }
    }

    // ── Debug UI ─────────────────────────────────────────────────────────────
    private setupDebug(toolbar: HTMLElement): void {
        // Breakpoint gutter.
        this.fadeEditor!.onBreakpointToggle((line) => this.toggleBreakpoint(line));

        toolbar.append(mkBtn('fade-runnable__debug', '🐞 Debug', 'Set a breakpoint in the gutter, then Debug', () => void this.startDebug()));

        // Step toolbar — disabled until paused.
        this.debugBar = el('span', 'fade-runnable__debugbar');
        const step = (glyph: string, title: string, fn: () => void) => {
            const b = mkBtn('fade-runnable__stepbtn', glyph, title, fn);
            b.disabled = true;
            this.stepBtns.push(b);
            this.debugBar!.append(b);
        };
        step('▶', 'Continue (F5)', () => this.doContinue());
        step('↷', 'Step Over (F10)', () => this.doStep('over'));
        step('↴', 'Step Into (F11)', () => this.doStep('in'));
        step('↳', 'Step Out (Shift+F11)', () => this.doStep('out'));
        step('■', 'Stop (Shift+F5)', () => this.stopDebug());
        this.debugBar.style.display = 'none';
        toolbar.append(this.debugBar);

        this.buildDebugPane();
    }

    private buildDebugPane(): void {
        const pane = el('div', 'fade-runnable__debugpane');
        pane.style.display = 'none';

        const vars = section('Variables');
        this.varsBody = vars.body;
        const frames = section('Call Stack');
        this.framesBody = frames.body;
        const bps = section('Breakpoints');
        this.bpBody = bps.body;

        // Debug Console (REPL)
        const repl = section('Debug Console');
        this.replLog = el('div', 'fade-runnable__repl-log');
        const row = el('div', 'fade-runnable__repl-row');
        const prompt = el('span', 'fade-runnable__repl-prompt'); prompt.textContent = '›';
        this.replInput = document.createElement('input');
        this.replInput.className = 'fade-runnable__repl-input';
        this.replInput.type = 'text';
        this.replInput.placeholder = 'Evaluate an expression (while paused)…';
        this.replInput.disabled = true;
        this.replInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); void this.evalRepl(this.replInput!.value); this.replInput!.value = ''; }
        });
        row.append(prompt, this.replInput);
        repl.body.append(this.replLog, row);

        pane.append(vars.root, frames.root, bps.root, repl.root);
        this.append(pane);
        this.debugPane = pane;
        this.renderBreakpoints(); // breakpoints list is meaningful even before a session
    }

    private toggleBreakpoint(line: number): void {
        if (this.breakpoints.has(line)) this.breakpoints.delete(line);
        else this.breakpoints.add(line);
        this.fadeEditor!.setBreakpointLines([...this.breakpoints]);
        this.renderBreakpoints();
        if (this.debugging) void this.pushBreakpoints();
    }

    private async startDebug(): Promise<void> {
        if (this.debugging || !this.runner || !this.iframe) return;
        this.debugging = true;
        this.setStatus('Loading runtime…', 'out');
        if (this.debugPane) this.debugPane.style.display = 'block';
        try {
            if (!this.armed) { await armWebPreview(this.runner, this.iframe, this.assetBase()); this.armed = true; }
            this.runner.onDebugEvent = (ev) => void this.onDebugEvent(ev as { type: string; json?: string });
            if (this.debugBar) this.debugBar.style.display = 'inline-flex';
            this.setStatus('Debugging…', 'out');
            await this.runner.debugStart(this.fadeEditor!.getValue());
            await this.pushBreakpoints();
            await this.runner.debugContinue(); // run to first breakpoint (or completion)
        } catch (e) {
            this.setStatus(e instanceof Error ? e.message : String(e), 'error');
            this.stopDebug();
        }
    }

    private pushBreakpoints(): Promise<boolean> {
        // Editor lines are 1-based; the runtime wants 0-based.
        return this.runner!.debugSetBreakpoints([...this.breakpoints].map((ln) => ({ line: ln - 1, column: 0 })));
    }

    private doContinue(): void {
        this.setResumed('running…');
        void this.runner!.debugContinue();
    }

    private doStep(kind: 'over' | 'in' | 'out'): void {
        this.setResumed('stepping…');
        // A step landing arrives as a PROTO_ACK(status=1) event handled in
        // onDebugEvent — that re-highlights the new line. Don't clear+leave here.
        void this.runner!.debugStep(kind);
    }

    /** Transient "resumed" UI between a control action and the next stop. */
    private setResumed(status: string): void {
        this.paused = false;
        this.setStepEnabled(false);
        if (this.replInput) this.replInput.disabled = true;
        this.fadeEditor?.setCurrentLine(null);
        this.setStatus(status, 'out');
    }

    private async onDebugEvent(ev: { type: string; json?: string }): Promise<void> {
        if (ev.type === 'REV_REQUEST_BREAKPOINT') {
            await this.onPaused('paused on breakpoint');
        } else if (ev.type === 'PROTO_ACK') {
            // A landed step is a PROTO_ACK with status=1 + a string reason
            // (the runtime has no separate "stopped" event for steps).
            let stepLanded = false;
            if (ev.json) { try { const p = JSON.parse(ev.json); stepLanded = p?.status === 1 && typeof p?.reason === 'string'; } catch { /* not structured */ } }
            if (stepLanded) await this.onPaused('paused');
        } else if (ev.type === 'REV_REQUEST_EXITED' || ev.type === 'complete') {
            this.stopDebug('program exited');
        } else if (ev.type === 'error' || ev.type === 'REV_REQUEST_EXPLODE') {
            let msg = 'runtime error';
            if (ev.json) { try { msg = JSON.parse(ev.json)?.message || msg; } catch { /* keep default */ } }
            this.appendRepl(msg, 'err');
            this.stopDebug(msg);
        }
    }

    /** The VM stopped at a line. Refresh frames, variables, and the editor. */
    private async onPaused(status: string): Promise<void> {
        this.paused = true;
        this.activeFrame = 0;
        this.setStatus(status, 'out');
        this.setStepEnabled(true);
        if (this.replInput) this.replInput.disabled = false;
        try {
            const res: any = await this.runner!.debugStackFrames();
            this.frames = Array.isArray(res) ? res : (res?.stackFrames ?? []);
        } catch { this.frames = []; }
        const line = this.frames[this.activeFrame]?.lineNumber;
        if (typeof line === 'number') this.fadeEditor!.setCurrentLine(line + 1);
        this.renderCallStack();
        await this.refreshVars();
    }

    private async selectFrame(index: number): Promise<void> {
        if (!this.paused) return;
        this.activeFrame = index;
        const line = this.frames[index]?.lineNumber;
        if (typeof line === 'number') this.fadeEditor!.setCurrentLine(line + 1);
        this.renderCallStack();
        await this.refreshVars();
    }

    private async refreshVars(): Promise<void> {
        if (!this.varsBody) return;
        let scopes: any[] = [];
        try { scopes = (await this.runner!.debugScopes(this.activeFrame))?.scopes ?? []; } catch { /* none */ }
        const rows: string[] = [];
        for (const sc of scopes) {
            const vars = sc.variables ?? [];
            if (sc.scopeName && scopes.length > 1) rows.push(`<div class="fade-runnable__scope">${escapeHtml(sc.scopeName)}</div>`);
            for (const v of vars) {
                rows.push(`<div class="fade-runnable__var"><span class="fade-runnable__varname">${escapeHtml(v.name)}</span><span class="fade-runnable__vartype">${escapeHtml(v.type ?? '')}</span><span class="fade-runnable__varval">${escapeHtml(String(v.value))}</span></div>`);
            }
        }
        this.varsBody.innerHTML = rows.length ? rows.join('') : '<div class="fade-runnable__empty">No variables in scope</div>';
    }

    private renderCallStack(): void {
        if (!this.framesBody) return;
        if (!this.frames.length) { this.framesBody.innerHTML = '<div class="fade-runnable__empty">No active session</div>'; return; }
        this.framesBody.innerHTML = '';
        this.frames.forEach((f, i) => {
            const row = el('div', 'fade-runnable__frame' + (i === this.activeFrame ? ' fade-runnable__frame--active' : ''));
            row.innerHTML = `<span class="fade-runnable__frame-name">${escapeHtml(f.name || '(anonymous)')}</span><span class="fade-runnable__frame-line">:${f.lineNumber + 1}</span>`;
            row.addEventListener('click', () => void this.selectFrame(i));
            this.framesBody!.append(row);
        });
    }

    private renderBreakpoints(): void {
        if (!this.bpBody) return;
        const lines = [...this.breakpoints].sort((a, b) => a - b);
        if (!lines.length) { this.bpBody.innerHTML = '<div class="fade-runnable__empty">No breakpoints — click the gutter</div>'; return; }
        this.bpBody.innerHTML = '';
        for (const ln of lines) {
            const row = el('div', 'fade-runnable__bp');
            row.innerHTML = `<span class="fade-runnable__bp-dot"></span><span class="fade-runnable__bp-line">Line ${ln}</span>`;
            const rm = mkBtn('fade-runnable__bp-remove', '×', 'Remove breakpoint', () => this.toggleBreakpoint(ln));
            row.append(rm);
            this.bpBody!.append(row);
        }
    }

    private async evalRepl(expr: string): Promise<void> {
        const e = expr.trim();
        if (!e || !this.paused) return;
        this.appendRepl(`› ${e}`, 'in');
        try {
            const r = await this.runner!.debugEval(this.activeFrame, e);
            // Convention: id === -1 means the eval failed and `value` is the error.
            if (r && r.id === -1) this.appendRepl(String(r.value), 'err');
            else this.appendRepl(r ? String(r.value) : '(no result)', 'out');
        } catch (err) {
            this.appendRepl(err instanceof Error ? err.message : String(err), 'err');
        }
        // Variables may have changed if the expression had side effects.
        await this.refreshVars();
    }

    private appendRepl(text: string, kind: 'in' | 'out' | 'err'): void {
        if (!this.replLog) return;
        const line = el('div', `fade-runnable__repl-line fade-runnable__repl-line--${kind}`);
        line.textContent = text;
        this.replLog.append(line);
        this.replLog.scrollTop = this.replLog.scrollHeight;
    }

    private setStepEnabled(on: boolean): void {
        for (const b of this.stepBtns) b.disabled = !on;
        // Stop stays enabled while a session is live.
        const stop = this.stepBtns[this.stepBtns.length - 1];
        if (stop) stop.disabled = false;
    }

    private stopDebug(status = ''): void {
        if (this.runner) { void this.runner.debugTerminate().catch(() => {}); this.runner.onDebugEvent = undefined; }
        this.debugging = false;
        this.paused = false;
        this.frames = [];
        this.fadeEditor?.setCurrentLine(null);
        if (this.debugBar) this.debugBar.style.display = 'none';
        if (this.debugPane) this.debugPane.style.display = 'none';
        if (this.replInput) this.replInput.disabled = true;
        this.setStatus(status, 'out');
    }

    private assetBase(): string { return this.getAttribute('asset-base') ?? '/runtime/'; }

    private setStatus(text: string, kind: 'out' | 'error'): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = `fade-runnable__status fade-runnable__status--${kind}`;
    }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function el(tag: string, className: string): HTMLElement {
    const e = document.createElement(tag);
    e.className = className;
    return e;
}

function mkBtn(className: string, label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = className;
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', onClick);
    return b;
}

/** A collapsible VSCode-style debug section: header (twisty + title) + body. */
function section(title: string): { root: HTMLElement; body: HTMLElement } {
    const root = el('div', 'fade-runnable__section');
    const header = el('div', 'fade-runnable__section-head');
    const twisty = el('span', 'fade-runnable__twisty'); twisty.textContent = '▾';
    const label = el('span', 'fade-runnable__section-title'); label.textContent = title;
    header.append(twisty, label);
    const body = el('div', 'fade-runnable__section-body');
    header.addEventListener('click', () => {
        const collapsed = body.classList.toggle('fade-runnable__section-body--collapsed');
        twisty.textContent = collapsed ? '▸' : '▾';
    });
    root.append(header, body);
    return { root, body };
}

/** Strip the common leading indentation from slotted HTML source. */
function dedent(s: string): string {
    const lines = s.replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
    const nonEmpty = lines.filter((l) => l.trim());
    if (!nonEmpty.length) return s.trim();
    const indent = Math.min(...nonEmpty.map((l) => l.match(/^\s*/)![0].length));
    return lines.map((l) => l.slice(indent)).join('\n');
}

let stylesInjected = false;
function injectStyles(): void {
    if (stylesInjected || typeof document === 'undefined') return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-fade-runnable', '');
    style.textContent = `
.fade-runnable { display: block; border: 1px solid #333; border-radius: 6px; overflow: hidden; background: #1e1e1e; color: #d4d4d4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.fade-runnable__editor { height: 220px; }
.fade-runnable__toolbar { display: flex; gap: 8px; align-items: center; padding: 6px 8px; background: #252526; border-top: 1px solid #333; }
.fade-runnable__run { cursor: pointer; background: #0e639c; color: #fff; border: 0; border-radius: 4px; padding: 4px 12px; font: inherit; font-size: 13px; }
.fade-runnable__run:hover:not(:disabled) { background: #1177bb; }
.fade-runnable__run:disabled { opacity: 0.6; cursor: default; }
.fade-runnable__debug { cursor: pointer; background: #3a3d41; color: #fff; border: 0; border-radius: 4px; padding: 4px 12px; font: inherit; font-size: 13px; }
.fade-runnable__debug:hover { background: #4a4d51; }
.fade-runnable__status { padding: 6px 8px; color: #d4d4d4; font-size: 13px; white-space: pre-wrap; }
.fade-runnable__status:empty { display: none; }
.fade-runnable__status--error { color: #f14c4c; }
.fade-runnable__vm { display: block; width: 100%; height: 160px; border: 0; border-top: 1px solid #333; background: #1e1e1e; }
.fade-runnable__debugbar { display: inline-flex; gap: 2px; align-items: center; margin-left: 4px; padding-left: 8px; border-left: 1px solid #3a3a3a; }
.fade-runnable__stepbtn { cursor: pointer; background: transparent; color: #cccccc; border: 0; border-radius: 4px; width: 26px; height: 24px; font-size: 14px; line-height: 1; }
.fade-runnable__stepbtn:hover:not(:disabled) { background: #2a2d2e; }
.fade-runnable__stepbtn:disabled { opacity: 0.35; cursor: default; }
/* Debug pane — collapsible sections, VSCode "Run and Debug" vibes */
.fade-runnable__debugpane { border-top: 1px solid #333; background: #1e1e1e; font-size: 12px; }
.fade-runnable__section { border-bottom: 1px solid #2b2b2b; }
.fade-runnable__section-head { display: flex; align-items: center; gap: 4px; padding: 4px 8px; cursor: pointer; user-select: none; background: #252526; }
.fade-runnable__section-head:hover { background: #2a2d2e; }
.fade-runnable__twisty { color: #888; font-size: 10px; width: 12px; }
.fade-runnable__section-title { text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: #ccc; }
.fade-runnable__section-body { padding: 4px 8px 6px; max-height: 180px; overflow: auto; }
.fade-runnable__section-body--collapsed { display: none; }
.fade-runnable__empty { color: #777; font-style: italic; padding: 2px 0; }
.fade-runnable__scope { color: #888; text-transform: uppercase; font-size: 10px; margin: 4px 0 2px; }
.fade-runnable__var { display: flex; gap: 8px; padding: 1px 0; }
.fade-runnable__varname { color: #9CDCFE; }
.fade-runnable__vartype { color: #569CD6; opacity: 0.7; }
.fade-runnable__varval { color: #B5CEA8; margin-left: auto; }
.fade-runnable__frame { display: flex; gap: 4px; padding: 2px 4px; border-radius: 3px; cursor: pointer; }
.fade-runnable__frame:hover { background: #2a2d2e; }
.fade-runnable__frame--active { background: #37373d; }
.fade-runnable__frame-name { color: #dcdcaa; }
.fade-runnable__frame-line { color: #888; }
.fade-runnable__bp { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.fade-runnable__bp-dot { width: 9px; height: 9px; border-radius: 50%; background: #e51400; flex: none; }
.fade-runnable__bp-line { color: #d4d4d4; }
.fade-runnable__bp-remove { margin-left: auto; cursor: pointer; background: transparent; color: #888; border: 0; font-size: 14px; line-height: 1; }
.fade-runnable__bp-remove:hover { color: #f14c4c; }
.fade-runnable__repl-log { max-height: 120px; overflow: auto; white-space: pre-wrap; }
.fade-runnable__repl-line--in { color: #9CDCFE; }
.fade-runnable__repl-line--out { color: #d4d4d4; }
.fade-runnable__repl-line--err { color: #f14c4c; }
.fade-runnable__repl-row { display: flex; align-items: center; gap: 6px; margin-top: 4px; border-top: 1px solid #2b2b2b; padding-top: 4px; }
.fade-runnable__repl-prompt { color: #6a9955; }
.fade-runnable__repl-input { flex: 1; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3a3a3a; border-radius: 4px; padding: 3px 6px; font: inherit; font-size: 12px; }
.fade-runnable__repl-input:disabled { opacity: 0.5; }
`;
    document.head.appendChild(style);
}

if (typeof customElements !== 'undefined' && !customElements.get('fade-runnable')) {
    customElements.define('fade-runnable', FadeRunnableElement);
}
