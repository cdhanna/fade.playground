// <fade-runnable> — an editable Fade snippet with Run + output, and (with the
// `debug` attribute) a VSCode-style debugger: breakpoint gutter, step controls,
// Variables / Watch / Call Stack / Breakpoints, and a Debug Console REPL.
//
// Two layouts:
//   default — stacked: editor, toolbar, output, debug sections below.
//   layout="ide" — a mini VSCode: debugger sidebar (left), editor (right),
//                  output + Debug Console (bottom), step controls (top-right).
//
// Source: the `code` property (best for generated pages), a `code` attribute,
// or slotted text. Attributes: asset-base, readonly, autorun, no-run, debug,
// layout, watch (comma-separated initial watch expressions).

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
    private ide = false;

    // Debug state
    private debugEnabled = false;
    private debugging = false;
    private paused = false;
    private breakpoints = new Set<number>(); // 1-based lines
    private frames: StackFrame[] = [];
    private activeFrame = 0;
    private watches: string[] = [];
    private debugBar?: HTMLElement;
    private stepBtns: HTMLButtonElement[] = [];
    private sidebar?: HTMLElement;
    private varsBody?: HTMLElement;
    private watchBody?: HTMLElement;
    private framesBody?: HTMLElement;
    private bpBody?: HTMLElement;
    private replLog?: HTMLElement;
    private replInput?: HTMLInputElement;

    get code(): string { return this.fadeEditor?.getValue() ?? this._code ?? ''; }
    set code(v: string) { this._code = v; if (this.fadeEditor) this.fadeEditor.setValue(v); }

    connectedCallback(): void {
        if (this.fadeEditor) return;
        injectStyles();
        const source = this._code ?? this.getAttribute('code') ?? dedent(this.textContent ?? '');
        const assetBase = this.getAttribute('asset-base') ?? '/runtime/';
        const readonly = this.hasAttribute('readonly');
        const noRun = this.hasAttribute('no-run');
        this.debugEnabled = this.hasAttribute('debug') && !noRun && !readonly;
        this.ide = this.debugEnabled && this.getAttribute('layout') === 'ide';
        this.watches = (this.getAttribute('watch') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

        this.textContent = '';
        this.classList.add('fade-runnable');
        if (this.ide) this.classList.add('fade-runnable--ide');

        const editorHost = el('div', 'fade-runnable__editor');
        const toolbar = el('div', 'fade-runnable__toolbar');
        this.statusEl = el('div', 'fade-runnable__status');

        this.runner = getSharedRunner(assetBase);
        this.fadeEditor = createFadeEditor(editorHost, {
            runner: this.runner, value: source, readonly,
            diagnostics: !readonly, glyphMargin: this.debugEnabled,
            lspReady: getLspReady(this.runner, assetBase),
        });

        this.runBtn = mkBtn('fade-runnable__run', '▶ Run', 'Run (⌘R)', () => void this.run());

        if (noRun) { this.append(editorHost, toolbar, this.statusEl); toolbar.append(this.runBtn); return; }

        this.iframe = document.createElement('iframe');
        this.iframe.className = 'fade-runnable__vm';
        this.iframe.setAttribute('title', 'Fade output');

        toolbar.append(this.runBtn);
        if (this.debugEnabled) this.setupDebugControls(toolbar);

        if (this.ide) this.layoutIde(editorHost, toolbar);
        else this.layoutStacked(editorHost, toolbar);

        if (this.hasAttribute('autorun')) void this.run();
    }

    disconnectedCallback(): void { this.fadeEditor?.dispose(); this.fadeEditor = undefined; }

    // ── Layouts ──────────────────────────────────────────────────────────────
    private layoutStacked(editorHost: HTMLElement, toolbar: HTMLElement): void {
        this.append(editorHost, toolbar, this.statusEl!, this.iframe!);
        if (this.debugEnabled) {
            const pane = el('div', 'fade-runnable__debugpane');
            pane.append(this.buildSidebar(), this.buildConsole());
            this.append(pane);
        }
    }

    private layoutIde(editorHost: HTMLElement, toolbar: HTMLElement): void {
        editorHost.classList.add('fade-runnable__pane-editor');
        // Status flows inline in the toolbar, just left of the step strip
        // (rather than a separate grid child that would overlap it).
        const strip = toolbar.querySelector('.fade-runnable__debugbar');
        if (strip) toolbar.insertBefore(this.statusEl!, strip);
        else toolbar.append(this.statusEl!);
        const sidebar = this.buildSidebar();
        const bottom = el('div', 'fade-runnable__bottom');
        const outWrap = el('div', 'fade-runnable__outwrap');
        outWrap.append(paneHeader('Output'), this.iframe!);
        bottom.append(outWrap, this.buildConsole());
        this.append(toolbar, sidebar, editorHost, bottom);
    }

    // ── Debug toolbar (Run/Debug + step strip) ───────────────────────────────
    private setupDebugControls(toolbar: HTMLElement): void {
        this.fadeEditor!.onBreakpointToggle((line) => this.toggleBreakpoint(line));
        toolbar.append(mkBtn('fade-runnable__debug', '🐞 Debug', 'Set a breakpoint, then Debug', () => void this.startDebug()));

        // Step strip — pushed to the top-right.
        this.debugBar = el('span', 'fade-runnable__debugbar');
        const step = (glyph: string, title: string, fn: () => void) => {
            const b = mkBtn('fade-runnable__stepbtn', glyph, title, fn);
            b.disabled = true; this.stepBtns.push(b); this.debugBar!.append(b);
        };
        step('▶', 'Continue (F5)', () => this.doContinue());
        step('↷', 'Step Over (F10)', () => this.doStep('over'));
        step('↴', 'Step Into (F11)', () => this.doStep('in'));
        step('↳', 'Step Out (⇧F11)', () => this.doStep('out'));
        step('■', 'Stop (⇧F5)', () => this.stopDebug());
        toolbar.append(spacer(), this.debugBar);
    }

    // ── Debug sidebar (Variables / Watch / Call Stack / Breakpoints) ─────────
    private buildSidebar(): HTMLElement {
        const sidebar = el('div', 'fade-runnable__sidebar');
        this.sidebar = sidebar;

        const vars = section('Variables');
        this.varsBody = vars.body;
        this.varsBody.innerHTML = emptyMsg('Not paused');

        const watch = section('Watch');
        this.watchBody = watch.body;
        const addWatch = mkBtn('fade-runnable__section-action', '+', 'Add watch expression', () => this.promptWatch());
        watch.head.append(spacer(), addWatch);

        const frames = section('Call Stack');
        this.framesBody = frames.body;
        this.framesBody.innerHTML = emptyMsg('Not paused');

        const bps = section('Breakpoints');
        this.bpBody = bps.body;

        sidebar.append(vars.root, watch.root, frames.root, bps.root);
        this.renderWatch();
        this.renderBreakpoints();
        return sidebar;
    }

    private buildConsole(): HTMLElement {
        const wrap = el('div', 'fade-runnable__console');
        wrap.append(paneHeader('Debug Console'));
        this.replLog = el('div', 'fade-runnable__repl-log');
        const row = el('div', 'fade-runnable__repl-row');
        const prompt = el('span', 'fade-runnable__repl-prompt'); prompt.textContent = '›';
        this.replInput = document.createElement('input');
        this.replInput.className = 'fade-runnable__repl-input';
        this.replInput.type = 'text';
        this.replInput.placeholder = 'Evaluate / assign (while paused)…';
        this.replInput.disabled = true;
        this.replInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); const v = this.replInput!.value; this.replInput!.value = ''; void this.evalRepl(v); }
        });
        row.append(prompt, this.replInput);
        wrap.append(this.replLog, row);
        return wrap;
    }

    // ── Breakpoints ──────────────────────────────────────────────────────────
    private toggleBreakpoint(line: number): void {
        if (this.breakpoints.has(line)) this.breakpoints.delete(line);
        else this.breakpoints.add(line);
        this.fadeEditor!.setBreakpointLines([...this.breakpoints]);
        this.renderBreakpoints();
        if (this.debugging) void this.pushBreakpoints();
    }

    private renderBreakpoints(): void {
        if (!this.bpBody) return;
        const lines = [...this.breakpoints].sort((a, b) => a - b);
        if (!lines.length) { this.bpBody.innerHTML = emptyMsg('None — click the gutter'); return; }
        this.bpBody.innerHTML = '';
        for (const ln of lines) {
            const row = el('div', 'fade-runnable__bp');
            row.innerHTML = `<span class="fade-runnable__bp-dot"></span><span class="fade-runnable__bp-line">Line ${ln}</span>`;
            row.append(mkBtn('fade-runnable__bp-remove', '×', 'Remove breakpoint', () => this.toggleBreakpoint(ln)));
            this.bpBody!.append(row);
        }
    }

    // ── Session lifecycle ────────────────────────────────────────────────────
    private async startDebug(): Promise<void> {
        if (this.debugging || !this.runner || !this.iframe) return;
        this.debugging = true;
        this.setStatus('Loading runtime…', 'out');
        try {
            if (!this.armed) { await armWebPreview(this.runner, this.iframe, this.assetBase()); this.armed = true; }
            this.runner.onDebugEvent = (ev) => void this.onDebugEvent(ev as { type: string; json?: string });
            this.setStatus('Debugging…', 'out');
            await this.runner.debugStart(this.fadeEditor!.getValue());
            await this.pushBreakpoints();
            await this.runner.debugContinue();
        } catch (e) {
            this.setStatus(e instanceof Error ? e.message : String(e), 'error');
            this.stopDebug();
        }
    }

    private pushBreakpoints(): Promise<boolean> {
        return this.runner!.debugSetBreakpoints([...this.breakpoints].map((ln) => ({ line: ln - 1, column: 0 })));
    }

    private doContinue(): void { this.setResumed('running…'); void this.runner!.debugContinue(); }
    private doStep(kind: 'over' | 'in' | 'out'): void { this.setResumed('stepping…'); void this.runner!.debugStep(kind); }

    private setResumed(status: string): void {
        this.paused = false;
        this.setStepEnabled(false);
        if (this.replInput) this.replInput.disabled = true;
        this.fadeEditor?.setCurrentLine(null);
        this.setStatus(status, 'out');
    }

    private async onDebugEvent(ev: { type: string; json?: string }): Promise<void> {
        if (ev.type === 'REV_REQUEST_BREAKPOINT') { await this.onPaused('paused on breakpoint'); return; }
        if (ev.type === 'PROTO_ACK') {
            let stepLanded = false;
            if (ev.json) { try { const p = JSON.parse(ev.json); stepLanded = p?.status === 1 && typeof p?.reason === 'string'; } catch { /* not structured */ } }
            if (stepLanded) await this.onPaused('paused');
            return;
        }
        if (ev.type === 'REV_REQUEST_EXITED' || ev.type === 'complete') { this.stopDebug('program exited'); return; }
        if (ev.type === 'error' || ev.type === 'REV_REQUEST_EXPLODE') {
            let msg = 'runtime error';
            if (ev.json) { try { msg = JSON.parse(ev.json)?.message || msg; } catch { /* keep default */ } }
            this.appendRepl(msg, 'err');
            this.stopDebug(msg);
        }
    }

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
        this.moveToFrameLine();
        this.renderCallStack();
        await this.refreshVars();
        await this.refreshWatch();
    }

    private moveToFrameLine(): void {
        const line = this.frames[this.activeFrame]?.lineNumber;
        if (typeof line === 'number') this.fadeEditor!.setCurrentLine(line + 1);
    }

    private async selectFrame(index: number): Promise<void> {
        if (!this.paused) return;
        this.activeFrame = index;
        this.moveToFrameLine();
        this.renderCallStack();
        await this.refreshVars();
        await this.refreshWatch();
    }

    // ── Variables / Call Stack / Watch rendering ─────────────────────────────
    private async refreshVars(): Promise<void> {
        if (!this.varsBody) return;
        let scopes: any[] = [];
        try { scopes = (await this.runner!.debugScopes(this.activeFrame))?.scopes ?? []; } catch { /* none */ }
        const rows: string[] = [];
        for (const sc of scopes) {
            if (sc.scopeName) rows.push(`<div class="fade-runnable__scope">${escapeHtml(sc.scopeName)}</div>`);
            for (const v of (sc.variables ?? [])) rows.push(varRow(v.name, v.type, v.value));
        }
        this.varsBody.innerHTML = rows.length ? rows.join('') : emptyMsg('No variables in scope');
    }

    private renderCallStack(): void {
        if (!this.framesBody) return;
        if (!this.frames.length) { this.framesBody.innerHTML = emptyMsg('Not paused'); return; }
        this.framesBody.innerHTML = '';
        this.frames.forEach((f, i) => {
            const row = el('div', 'fade-runnable__frame' + (i === this.activeFrame ? ' fade-runnable__frame--active' : ''));
            row.innerHTML = `<span class="fade-runnable__frame-name">${escapeHtml(f.name || '(top scope)')}</span><span class="fade-runnable__frame-line">${f.lineNumber + 1}:${f.colNumber}</span>`;
            row.addEventListener('click', () => void this.selectFrame(i));
            this.framesBody!.append(row);
        });
    }

    private promptWatch(): void {
        const inp = document.createElement('input');
        inp.className = 'fade-runnable__watch-add';
        inp.placeholder = 'Expression to watch…';
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { const v = inp.value.trim(); if (v) { this.watches.push(v); this.renderWatch(); void this.refreshWatch(); } inp.remove(); }
            else if (e.key === 'Escape') inp.remove();
        });
        inp.addEventListener('blur', () => inp.remove());
        this.watchBody!.prepend(inp);
        inp.focus();
    }

    private renderWatch(): void {
        if (!this.watchBody) return;
        this.watchBody.querySelectorAll('.fade-runnable__watch-item, .fade-runnable__empty').forEach((n) => n.remove());
        if (!this.watches.length) {
            const e = el('div', 'fade-runnable__empty'); e.textContent = 'No watches — click +';
            this.watchBody.append(e);
            return;
        }
        this.watches.forEach((expr, i) => {
            const row = el('div', 'fade-runnable__watch-item');
            row.innerHTML = `<span class="fade-runnable__watch-expr">${escapeHtml(expr)}</span><span class="fade-runnable__watch-val">—</span>`;
            row.append(mkBtn('fade-runnable__bp-remove', '×', 'Remove', () => { this.watches.splice(i, 1); this.renderWatch(); void this.refreshWatch(); }));
            this.watchBody!.append(row);
        });
    }

    private async refreshWatch(): Promise<void> {
        if (!this.watchBody) return;
        const cells = this.watchBody.querySelectorAll<HTMLElement>('.fade-runnable__watch-val');
        for (let i = 0; i < this.watches.length && i < cells.length; i++) {
            const cell = cells[i];
            if (!this.paused) { cell.textContent = '—'; cell.className = 'fade-runnable__watch-val'; continue; }
            try {
                const r = await this.runner!.debugEval(this.activeFrame, this.watches[i]);
                if (!r || r.id === -1) { cell.textContent = r?.value ?? 'error'; cell.className = 'fade-runnable__watch-val fade-runnable__watch-val--err'; }
                else { cell.textContent = String(r.value); cell.className = 'fade-runnable__watch-val'; }
            } catch { cell.textContent = 'error'; cell.className = 'fade-runnable__watch-val fade-runnable__watch-val--err'; }
        }
    }

    // ── REPL (executes statements — can set variables) ───────────────────────
    private async evalRepl(raw: string): Promise<void> {
        const expr = raw.trim();
        if (!expr || !this.paused) return;
        this.appendRepl(`› ${expr}`, 'in');
        try {
            // debugRepl RUNS the code (assignments take effect), unlike debugEval.
            const r = await this.runner!.debugRepl(this.activeFrame, expr);
            this.appendRepl(r ? String(r.value) : '(no result)', r && r.id === -1 ? 'err' : 'out');
        } catch (err) {
            this.appendRepl(err instanceof Error ? err.message : String(err), 'err');
        }
        // A repl statement may mutate state — refresh variables + watches.
        await this.refreshVars();
        await this.refreshWatch();
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
        const stop = this.stepBtns[this.stepBtns.length - 1];
        if (stop) stop.disabled = false; // Stop stays live for the whole session
    }

    private stopDebug(status = ''): void {
        if (this.runner) { void this.runner.debugTerminate().catch(() => {}); this.runner.onDebugEvent = undefined; }
        this.debugging = false;
        this.paused = false;
        this.frames = [];
        this.fadeEditor?.setCurrentLine(null);
        this.setStepEnabled(false);
        for (const b of this.stepBtns) b.disabled = true;
        if (this.replInput) this.replInput.disabled = true;
        if (this.varsBody) this.varsBody.innerHTML = emptyMsg('Not paused');
        if (this.framesBody) this.framesBody.innerHTML = emptyMsg('Not paused');
        void this.refreshWatch();
        this.setStatus(status, 'out');
    }

    // ── Run ──────────────────────────────────────────────────────────────────
    async run(): Promise<void> {
        if (this.running || !this.runner || !this.iframe) return;
        this.running = true;
        if (this.runBtn) { this.runBtn.disabled = true; this.runBtn.textContent = '… Running'; }
        this.setStatus('', 'out');
        try {
            if (!this.armed) { this.setStatus('Loading runtime…', 'out'); await armWebPreview(this.runner, this.iframe, this.assetBase()); this.armed = true; this.setStatus('', 'out'); }
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
function el(tag: string, className: string): HTMLElement { const e = document.createElement(tag); e.className = className; return e; }
function spacer(): HTMLElement { return el('span', 'fade-runnable__spacer'); }
function emptyMsg(t: string): string { return `<div class="fade-runnable__empty">${escapeHtml(t)}</div>`; }
function varRow(name: string, type: string | undefined, value: unknown): string {
    return `<div class="fade-runnable__var"><span class="fade-runnable__varname">${escapeHtml(name)}</span>${type ? `<span class="fade-runnable__vartype">${escapeHtml(type)}</span>` : ''}<span class="fade-runnable__varval">${escapeHtml(String(value))}</span></div>`;
}
function mkBtn(className: string, label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = className; b.type = 'button'; b.textContent = label; b.title = title;
    b.addEventListener('click', onClick);
    return b;
}
function paneHeader(title: string): HTMLElement { const h = el('div', 'fade-runnable__pane-title'); h.textContent = title; return h; }
function section(title: string): { root: HTMLElement; head: HTMLElement; body: HTMLElement } {
    const root = el('div', 'fade-runnable__section');
    const head = el('div', 'fade-runnable__section-head');
    const twisty = el('span', 'fade-runnable__twisty'); twisty.textContent = '▾';
    const label = el('span', 'fade-runnable__section-title'); label.textContent = title;
    head.append(twisty, label);
    const body = el('div', 'fade-runnable__section-body');
    head.addEventListener('click', () => {
        const collapsed = body.classList.toggle('fade-runnable__section-body--collapsed');
        twisty.textContent = collapsed ? '▸' : '▾';
    });
    root.append(head, body);
    return { root, head, body };
}
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
.fade-runnable__spacer { flex: 1; }
.fade-runnable__run { cursor: pointer; background: #0e639c; color: #fff; border: 0; border-radius: 4px; padding: 4px 12px; font: inherit; font-size: 13px; }
.fade-runnable__run:hover:not(:disabled) { background: #1177bb; }
.fade-runnable__run:disabled { opacity: 0.6; cursor: default; }
.fade-runnable__debug { cursor: pointer; background: #3a3d41; color: #fff; border: 0; border-radius: 4px; padding: 4px 12px; font: inherit; font-size: 13px; }
.fade-runnable__debug:hover { background: #4a4d51; }
.fade-runnable__status { padding: 6px 8px; color: #d4d4d4; font-size: 13px; white-space: pre-wrap; }
.fade-runnable__status:empty { display: none; }
.fade-runnable__status--error { color: #f14c4c; }
.fade-runnable__vm { display: block; width: 100%; height: 160px; border: 0; border-top: 1px solid #333; background: #1e1e1e; }
.fade-runnable__debugbar { display: inline-flex; gap: 2px; align-items: center; background: #2d2d2d; border: 1px solid #3a3a3a; border-radius: 6px; padding: 2px; }
.fade-runnable__stepbtn { cursor: pointer; background: transparent; color: #cccccc; border: 0; border-radius: 4px; width: 26px; height: 24px; font-size: 14px; line-height: 1; }
.fade-runnable__stepbtn:hover:not(:disabled) { background: #3a3d41; }
.fade-runnable__stepbtn:disabled { opacity: 0.35; cursor: default; }
/* Debug sidebar / sections */
.fade-runnable__debugpane { border-top: 1px solid #333; }
.fade-runnable__sidebar { background: #1e1e1e; font-size: 12px; }
.fade-runnable__console { background: #1e1e1e; font-size: 12px; }
.fade-runnable__pane-title { text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: #bbb; padding: 5px 8px; background: #252526; border-bottom: 1px solid #2b2b2b; }
.fade-runnable__section { border-bottom: 1px solid #2b2b2b; }
.fade-runnable__section-head { display: flex; align-items: center; gap: 4px; padding: 4px 8px; cursor: pointer; user-select: none; background: #252526; }
.fade-runnable__section-head:hover { background: #2a2d2e; }
.fade-runnable__twisty { color: #888; font-size: 10px; width: 12px; }
.fade-runnable__section-title { text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: #ccc; }
.fade-runnable__section-action { margin-left: auto; cursor: pointer; background: transparent; color: #bbb; border: 0; font-size: 14px; line-height: 1; width: 18px; }
.fade-runnable__section-action:hover { color: #fff; }
.fade-runnable__section-body { padding: 4px 8px 6px; max-height: 200px; overflow: auto; }
.fade-runnable__section-body--collapsed { display: none; }
.fade-runnable__empty { color: #777; font-style: italic; padding: 2px 0; }
.fade-runnable__scope { color: #888; text-transform: uppercase; font-size: 10px; margin: 4px 0 2px; }
.fade-runnable__var { display: flex; gap: 8px; padding: 1px 0; }
.fade-runnable__varname { color: #9CDCFE; }
.fade-runnable__vartype { color: #569CD6; opacity: 0.6; }
.fade-runnable__varval { color: #B5CEA8; margin-left: auto; }
.fade-runnable__watch-item { display: flex; gap: 8px; padding: 1px 0; align-items: center; }
.fade-runnable__watch-expr { color: #9CDCFE; }
.fade-runnable__watch-val { color: #B5CEA8; margin-left: auto; }
.fade-runnable__watch-val--err { color: #f14c4c; font-style: italic; }
.fade-runnable__watch-add { width: 100%; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3a3a3a; border-radius: 4px; padding: 2px 6px; font: inherit; font-size: 12px; margin-bottom: 4px; }
.fade-runnable__frame { display: flex; gap: 6px; padding: 2px 4px; border-radius: 3px; cursor: pointer; }
.fade-runnable__frame:hover { background: #2a2d2e; }
.fade-runnable__frame--active { background: #37373d; }
.fade-runnable__frame-name { color: #dcdcaa; }
.fade-runnable__frame-line { color: #888; margin-left: auto; }
.fade-runnable__bp { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.fade-runnable__bp-dot { width: 9px; height: 9px; border-radius: 50%; background: #e51400; flex: none; }
.fade-runnable__bp-line { color: #d4d4d4; }
.fade-runnable__bp-remove { margin-left: auto; cursor: pointer; background: transparent; color: #888; border: 0; font-size: 14px; line-height: 1; }
.fade-runnable__bp-remove:hover { color: #f14c4c; }
.fade-runnable__repl-log { flex: 1; overflow: auto; white-space: pre-wrap; padding: 4px 8px; min-height: 40px; }
.fade-runnable__repl-line--in { color: #9CDCFE; }
.fade-runnable__repl-line--out { color: #d4d4d4; }
.fade-runnable__repl-line--err { color: #f14c4c; }
.fade-runnable__repl-row { display: flex; align-items: center; gap: 6px; border-top: 1px solid #2b2b2b; padding: 4px 8px; }
.fade-runnable__repl-prompt { color: #6a9955; }
.fade-runnable__repl-input { flex: 1; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3a3a3a; border-radius: 4px; padding: 3px 6px; font: inherit; font-size: 12px; }
.fade-runnable__repl-input:disabled { opacity: 0.5; }
/* IDE layout — mini VSCode */
.fade-runnable--ide { display: grid; height: 560px; grid-template-columns: 260px 1fr; grid-template-rows: auto 1fr 190px; grid-template-areas: "toolbar toolbar" "sidebar editor" "bottom bottom"; }
.fade-runnable--ide .fade-runnable__toolbar { grid-area: toolbar; border-top: 0; border-bottom: 1px solid #333; }
.fade-runnable--ide .fade-runnable__sidebar { grid-area: sidebar; overflow: auto; border-right: 1px solid #333; }
.fade-runnable--ide .fade-runnable__pane-editor { grid-area: editor; height: 100%; }
.fade-runnable--ide .fade-runnable__bottom { grid-area: bottom; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #333; min-height: 0; }
.fade-runnable--ide .fade-runnable__outwrap { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid #333; }
.fade-runnable--ide .fade-runnable__vm { flex: 1; height: auto; border-top: 0; }
.fade-runnable--ide .fade-runnable__console { display: flex; flex-direction: column; min-height: 0; }
.fade-runnable--ide .fade-runnable__status { padding: 0 10px 0 4px; color: #bbb; font-size: 12px; white-space: nowrap; }
`;
    document.head.appendChild(style);
}

if (typeof customElements !== 'undefined' && !customElements.get('fade-runnable')) {
    customElements.define('fade-runnable', FadeRunnableElement);
}
