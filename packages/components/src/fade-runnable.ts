// <fade-runnable> — an editable Fade snippet with Run + output, and (with the
// `debug` attribute) a VSCode-style debugger: breakpoint gutter, codicon step
// controls, Variables (editable) / Watch / Call Stack / Breakpoints, a combined
// Output + Debug Console, and debug-value hovers.
//
// Layouts: default (stacked) or layout="ide" (a mini VSCode — debugger sidebar
// left, editor right, Output/Console bottom, step strip top-right).
//
// Source: `code` property, `code` attribute, or slotted text. Attributes:
// asset-base, readonly, autorun, no-run, debug, layout, watch.

import '@vscode/codicons/dist/codicon.css';
import { FadeRunner } from '@fadebasic/runtime';
import { createFadeEditor, setDebugHoverEvaluator, type FadeEditor } from '@fadebasic/editor';
import { armWebPreview } from './web-preview';
import { getSharedRunner, getLspReady } from './runner-pool';

interface StackFrame { name: string; lineNumber: number; colNumber: number }
interface DbgVar { id: number; name: string; type?: string; value: string }

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

    private debugEnabled = false;
    private hideRun = false;
    private debugging = false;
    private paused = false;
    private breakpoints = new Set<number>();
    private frames: StackFrame[] = [];
    private activeFrame = 0;
    private watches: string[] = [];
    private debugBar?: HTMLElement;
    private debugBtn?: HTMLButtonElement;
    private stepBtns: HTMLButtonElement[] = [];
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

        this.runBtn = iconBtn('fade-runnable__btn fade-runnable__btn--primary', 'play', 'Run', 'Run (⌘R)', () => void this.run());
        // `hide-run`: show only the Debug button (Run is suppressed) — used by the
        // homepage demo, which is all about the debugger.
        this.hideRun = this.hasAttribute('hide-run') && this.debugEnabled;

        if (noRun) { this.append(editorHost, toolbar, this.statusEl); toolbar.append(this.runBtn); return; }

        this.iframe = document.createElement('iframe');
        this.iframe.className = 'fade-runnable__vm';
        this.iframe.setAttribute('title', 'Fade output');

        // Pre-seed breakpoints from `breakpoints="11,14"` (1-based line numbers).
        if (this.debugEnabled) {
            for (const n of (this.getAttribute('breakpoints') ?? '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0)) {
                this.breakpoints.add(n);
            }
            if (this.breakpoints.size) this.fadeEditor.setBreakpointLines([...this.breakpoints]);
        }

        if (this.debugEnabled) this.setupDebugControls();
        this.assembleToolbar(toolbar);

        if (this.ide) this.layoutIde(editorHost, toolbar);
        else this.layoutStacked(editorHost, toolbar);
        if (this.hasAttribute('autorun')) void this.run();
    }

    disconnectedCallback(): void {
        this.fadeEditor?.dispose();
        this.fadeEditor = undefined;
        if (this.debugging) setDebugHoverEvaluator(null);
    }

    // ── Layouts ──────────────────────────────────────────────────────────────
    private layoutStacked(editorHost: HTMLElement, toolbar: HTMLElement): void {
        this.append(editorHost, toolbar, this.statusEl!);
        if (this.debugEnabled) this.append(this.buildSidebar());
        this.append(this.buildConsole());
    }

    private layoutIde(editorHost: HTMLElement, toolbar: HTMLElement): void {
        editorHost.classList.add('fade-runnable__pane-editor');
        // Status sits at the far left; the action group is right-aligned.
        toolbar.insertBefore(this.statusEl!, toolbar.firstChild);
        this.append(toolbar, this.buildSidebar(), editorHost, this.buildConsole());
    }

    // ── Toolbar assembly: status (left) … step strip, Debug, Run (right) ─────
    // Run is the primary action and lives at the far top-right corner, matching
    // the Playground's header where Run/Debug sit on the right.
    private assembleToolbar(toolbar: HTMLElement): void {
        toolbar.append(spacer());
        if (this.debugBar) toolbar.append(this.debugBar);
        if (this.debugBtn) toolbar.append(this.debugBtn);
        if (!this.hideRun) toolbar.append(this.runBtn!);
    }

    private setupDebugControls(): void {
        this.fadeEditor!.onBreakpointToggle((line) => this.toggleBreakpoint(line));
        this.debugBtn = iconBtn('fade-runnable__btn fade-runnable__btn--primary fade-runnable__btn--debug', 'debug-alt', 'Debug', 'Set a breakpoint, then Debug (⌘D)', () => void this.startDebug());

        this.debugBar = el('span', 'fade-runnable__debugbar');
        const step = (icon: string, title: string, fn: () => void) => {
            const b = iconBtn('fade-runnable__tb', icon, '', title, fn);
            b.disabled = true; this.stepBtns.push(b); this.debugBar!.append(b);
        };
        step('debug-continue', 'Continue (F5)', () => this.doContinue());
        step('debug-pause', 'Pause', () => void this.runner!.debugPause());
        step('debug-step-over', 'Step Over (F10)', () => this.doStep('over'));
        step('debug-step-into', 'Step Into (F11)', () => this.doStep('in'));
        step('debug-step-out', 'Step Out (⇧F11)', () => this.doStep('out'));
        step('debug-stop', 'Stop (⇧F5)', () => this.stopDebug());
    }

    // ── Debug sidebar ─────────────────────────────────────────────────────────
    private buildSidebar(): HTMLElement {
        const sidebar = el('div', 'fade-runnable__sidebar');
        const vars = section('Variables'); this.varsBody = vars.body; this.varsBody.innerHTML = emptyMsg('Not paused');
        const watch = section('Watch'); this.watchBody = watch.body;
        watch.head.append(spacer(), iconBtn('fade-runnable__section-action', 'add', '', 'Add watch expression', (e) => { e.stopPropagation(); this.promptWatch(); }));
        const frames = section('Call Stack'); this.framesBody = frames.body; this.framesBody.innerHTML = emptyMsg('Not paused');
        const bps = section('Breakpoints'); this.bpBody = bps.body;
        sidebar.append(vars.root, watch.root, frames.root, bps.root);
        this.renderWatch(); this.renderBreakpoints();
        return sidebar;
    }

    // ── Combined Output + Debug Console (single panel) ───────────────────────
    private buildConsole(): HTMLElement {
        const wrap = el('div', 'fade-runnable__console');
        wrap.append(paneHeader('Output'));
        wrap.append(this.iframe!);
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
            row.append(iconBtn('fade-runnable__row-remove', 'close', '', 'Remove breakpoint', () => this.toggleBreakpoint(ln)));
            this.bpBody!.append(row);
        }
    }

    // ── Session lifecycle ────────────────────────────────────────────────────
    private async startDebug(): Promise<void> {
        if (this.debugging || !this.runner || !this.iframe) return;
        this.debugging = true;
        this.classList.add('fade-runnable--debugging');
        this.setStatus('Loading runtime…');
        // Show the hovered symbol's live value while paused (VSCode behavior).
        setDebugHoverEvaluator(async (word) => {
            if (!this.paused || !this.runner) return null;
            const r = await this.runner.debugEval(this.activeFrame, word);
            return (r && r.id !== -1 && r.value != null) ? { value: String(r.value), type: r.type } : null;
        });
        try {
            if (!this.armed) { await armWebPreview(this.runner, this.iframe, this.assetBase()); this.armed = true; }
            this.runner.onDebugEvent = (ev) => void this.onDebugEvent(ev as { type: string; json?: string });
            this.setStatus('Debugging…');
            await this.runner.debugStart(this.fadeEditor!.getValue());
            await this.pushBreakpoints();
            await this.runner.debugContinue();
        } catch (e) {
            this.setStatus(e instanceof Error ? e.message : String(e), true);
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
        this.setStatus(status);
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
        this.setStatus(status);
        this.setStepEnabled(true);
        if (this.replInput) this.replInput.disabled = false;
        try { const res: any = await this.runner!.debugStackFrames(); this.frames = Array.isArray(res) ? res : (res?.stackFrames ?? []); } catch { this.frames = []; }
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

    // ── Variables (editable) ─────────────────────────────────────────────────
    private async refreshVars(): Promise<void> {
        if (!this.varsBody) return;
        let scopes: any[] = [];
        try { scopes = (await this.runner!.debugScopes(this.activeFrame))?.scopes ?? []; } catch { /* none */ }
        this.varsBody.innerHTML = '';
        let any = false;
        for (const sc of scopes) {
            const vars: DbgVar[] = sc.variables ?? [];
            if (!vars.length) continue;
            if (sc.scopeName) { const s = el('div', 'fade-runnable__scope'); s.textContent = sc.scopeName; this.varsBody.append(s); }
            for (const v of vars) { this.varsBody.append(this.varRow(v)); any = true; }
        }
        if (!any) this.varsBody.innerHTML = emptyMsg('No variables in scope');
    }

    private varRow(v: DbgVar): HTMLElement {
        const row = el('div', 'fade-runnable__var');
        const name = el('span', 'fade-runnable__varname'); name.textContent = v.name;
        if (v.type) { const t = el('span', 'fade-runnable__vartype'); t.textContent = v.type; row.append(name, t); } else row.append(name);
        const val = el('span', 'fade-runnable__varval'); val.textContent = v.value; val.title = 'Click to set value';
        // Click the value to edit it (VSCode behavior) → debugSetVariable.
        val.addEventListener('click', (e) => {
            if (!this.paused) return;
            e.stopPropagation();
            if (val.querySelector('input')) return;
            const input = document.createElement('input');
            input.className = 'fade-runnable__var-edit';
            input.value = v.value; input.spellcheck = false;
            val.textContent = ''; val.append(input); input.focus(); input.select();
            let done = false;
            const commit = async (apply: boolean) => {
                if (done) return; done = true;
                if (!apply) { val.textContent = v.value; return; }
                const rhs = input.value;
                try {
                    const r = await this.runner!.debugSetVariable(this.activeFrame, v.id, rhs);
                    this.appendRepl(`${v.name} = ${rhs}` + (r ? ` → ${r.value}` : ''), r && r.id === -1 ? 'err' : 'out');
                } catch (err) { this.appendRepl(err instanceof Error ? err.message : String(err), 'err'); }
                await this.refreshVars();
                await this.refreshWatch();
            };
            input.addEventListener('keydown', (ke) => { if (ke.key === 'Enter') void commit(true); else if (ke.key === 'Escape') void commit(false); });
            input.addEventListener('blur', () => void commit(true));
        });
        row.append(val);
        return row;
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

    // ── Watch ────────────────────────────────────────────────────────────────
    private promptWatch(): void {
        const inp = document.createElement('input');
        inp.className = 'fade-runnable__watch-add';
        inp.placeholder = 'Expression to watch…';
        const close = () => { if (inp.parentNode) inp.remove(); };
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { const v = inp.value.trim(); if (v) { this.watches.push(v); this.renderWatch(); void this.refreshWatch(); } close(); }
            else if (e.key === 'Escape') close();
        });
        inp.addEventListener('blur', close);
        this.watchBody!.prepend(inp);
        inp.focus();
    }

    private renderWatch(): void {
        if (!this.watchBody) return;
        this.watchBody.querySelectorAll('.fade-runnable__watch-item, .fade-runnable__empty').forEach((n) => n.remove());
        if (!this.watches.length) { const e = el('div', 'fade-runnable__empty'); e.textContent = 'No watches — click +'; this.watchBody.append(e); return; }
        this.watches.forEach((expr, i) => {
            const row = el('div', 'fade-runnable__watch-item');
            row.innerHTML = `<span class="fade-runnable__watch-expr">${escapeHtml(expr)}</span><span class="fade-runnable__watch-val">—</span>`;
            row.append(iconBtn('fade-runnable__row-remove', 'close', '', 'Remove', () => { this.watches.splice(i, 1); this.renderWatch(); void this.refreshWatch(); }));
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
            const r = await this.runner!.debugRepl(this.activeFrame, expr);
            this.appendRepl(r ? String(r.value) : '(no result)', r && r.id === -1 ? 'err' : 'out');
        } catch (err) { this.appendRepl(err instanceof Error ? err.message : String(err), 'err'); }
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
        if (stop) stop.disabled = false;
    }

    private stopDebug(status = ''): void {
        if (this.runner) { void this.runner.debugTerminate().catch(() => {}); this.runner.onDebugEvent = undefined; }
        setDebugHoverEvaluator(null);
        this.debugging = false;
        this.classList.remove('fade-runnable--debugging');
        this.paused = false;
        this.frames = [];
        this.fadeEditor?.setCurrentLine(null);
        for (const b of this.stepBtns) b.disabled = true;
        if (this.replInput) this.replInput.disabled = true;
        if (this.varsBody) this.varsBody.innerHTML = emptyMsg('Not paused');
        if (this.framesBody) this.framesBody.innerHTML = emptyMsg('Not paused');
        void this.refreshWatch();
        this.setStatus(status);
    }

    // ── Run ──────────────────────────────────────────────────────────────────
    async run(): Promise<void> {
        if (this.running || !this.runner || !this.iframe) return;
        this.running = true;
        if (this.runBtn) this.runBtn.disabled = true;
        this.setStatus('');
        try {
            if (!this.armed) { this.setStatus('Loading runtime…'); await armWebPreview(this.runner, this.iframe, this.assetBase()); this.armed = true; this.setStatus(''); }
            const result = JSON.parse(await this.runner.run(this.fadeEditor!.getValue()));
            if (result.compileError) this.setStatus(result.compileError, true);
            else if (result.ok === false && result.error) this.setStatus(result.error, true);
        } catch (e) {
            this.setStatus(e instanceof Error ? e.message : String(e), true);
        } finally {
            this.running = false;
            if (this.runBtn) this.runBtn.disabled = false;
        }
    }

    private assetBase(): string { return this.getAttribute('asset-base') ?? '/runtime/'; }
    private setStatus(text: string, err = false): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = 'fade-runnable__status' + (err ? ' fade-runnable__status--error' : '');
    }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function el(tag: string, className: string): HTMLElement { const e = document.createElement(tag); e.className = className; return e; }
function spacer(): HTMLElement { return el('span', 'fade-runnable__spacer'); }
function emptyMsg(t: string): string { return `<div class="fade-runnable__empty">${escapeHtml(t)}</div>`; }
function iconBtn(className: string, codicon: string, label: string, title: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = className; b.type = 'button'; b.title = title;
    const ic = document.createElement('span'); ic.className = `codicon codicon-${codicon}`;
    b.append(ic);
    if (label) { const t = document.createElement('span'); t.className = 'fade-runnable__btn-label'; t.textContent = label; b.append(t); }
    b.addEventListener('click', onClick);
    return b;
}
function paneHeader(title: string): HTMLElement { const h = el('div', 'fade-runnable__pane-title'); h.textContent = title; return h; }
function section(title: string): { root: HTMLElement; head: HTMLElement; body: HTMLElement } {
    const root = el('div', 'fade-runnable__section');
    const head = el('div', 'fade-runnable__section-head');
    const twisty = el('span', 'codicon codicon-chevron-down fade-runnable__twisty');
    const label = el('span', 'fade-runnable__section-title'); label.textContent = title;
    head.append(twisty, label);
    const body = el('div', 'fade-runnable__section-body');
    head.addEventListener('click', () => {
        const collapsed = body.classList.toggle('fade-runnable__section-body--collapsed');
        twisty.className = 'codicon fade-runnable__twisty ' + (collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down');
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
.fade-runnable__toolbar { display: flex; gap: 6px; align-items: center; padding: 6px 8px; background: #252526; border-top: 1px solid #333; }
.fade-runnable__spacer { flex: 1 1 auto; min-width: 0; }
/* width/flex are pinned so host \`button {}\` styles (e.g. width:100%) can't
   stretch these — the toolbar buttons are always content-width. */
.fade-runnable__btn { flex: 0 0 auto; width: auto; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; background: #3a3d41; color: #fff; border: 0; border-radius: 4px; padding: 4px 12px; font: inherit; font-size: 13px; white-space: nowrap; }
.fade-runnable__btn:hover:not(:disabled) { background: #4a4d51; }
.fade-runnable__btn:disabled { opacity: 0.6; cursor: default; }
.fade-runnable__btn--primary { background: #0e639c; }
.fade-runnable__btn--primary:hover:not(:disabled) { background: #1177bb; }
.fade-runnable__btn .codicon { font-size: 15px; }
/* flex: 0 1 auto so status yields to the step strip (never pushes it off the
   right edge); min-width:0 lets it ellipsize. */
.fade-runnable__status { flex: 0 1 auto; min-width: 0; padding: 0 8px; color: #bbb; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fade-runnable__status--error { color: #f14c4c; }
.fade-runnable__vm { display: block; width: 100%; height: 150px; border: 0; background: #1e1e1e; }
/* The step strip only appears while a debug session is active. flex:none keeps
   it fully visible regardless of the toolbar width. */
.fade-runnable__debugbar { display: none; flex: none; gap: 1px; align-items: center; background: #2d2d2d; border: 1px solid #3a3a3a; border-radius: 6px; padding: 2px; }
.fade-runnable--debugging .fade-runnable__debugbar { display: inline-flex; }
/* While a session is live the step strip drives things — hide the Debug button. */
.fade-runnable--debugging .fade-runnable__btn--debug { display: none; }
.fade-runnable__tb { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; background: transparent; color: #cccccc; border: 0; border-radius: 4px; width: 28px; height: 24px; }
.fade-runnable__tb:hover:not(:disabled) { background: #3a3d41; }
.fade-runnable__tb:disabled { opacity: 0.35; cursor: default; }
.fade-runnable__tb .codicon { font-size: 16px; }
.fade-runnable__tb .codicon-debug-continue { color: #89d185; }
/* Debug pane / sidebar */
.fade-runnable__sidebar { background: #1e1e1e; font-size: 12px; border-top: 1px solid #333; }
.fade-runnable__pane-title { text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: #bbb; padding: 5px 8px; background: #252526; border-bottom: 1px solid #2b2b2b; }
.fade-runnable__section { border-bottom: 1px solid #2b2b2b; }
.fade-runnable__section-head { display: flex; align-items: center; gap: 4px; padding: 4px 8px; cursor: pointer; user-select: none; background: #252526; }
.fade-runnable__section-head:hover { background: #2a2d2e; }
.fade-runnable__twisty { color: #888; font-size: 14px; }
.fade-runnable__section-title { text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: #ccc; }
.fade-runnable__section-action { flex: 0 0 auto; width: auto; margin-left: auto; cursor: pointer; background: transparent; color: #bbb; border: 0; display: inline-flex; }
.fade-runnable__section-action:hover { color: #fff; }
/* No horizontal padding here — rows are full-bleed and carry their own 8px
   inset, so each line (and its hover) spans the full column width. */
.fade-runnable__section-body { padding: 4px 0 6px; max-height: 200px; overflow: auto; }
.fade-runnable__section-body--collapsed { display: none; }
.fade-runnable__empty { color: #777; font-style: italic; padding: 2px 8px; }
.fade-runnable__scope { color: #888; text-transform: uppercase; font-size: 10px; margin: 4px 0 2px; padding: 0 8px; }
.fade-runnable__var { display: flex; gap: 8px; padding: 1px 8px; align-items: center; }
.fade-runnable__var:hover { background: #2a2d2e; }
.fade-runnable__varname { color: #9CDCFE; }
.fade-runnable__vartype { color: #569CD6; opacity: 0.6; }
.fade-runnable__varval { color: #B5CEA8; margin-left: auto; cursor: text; border-radius: 3px; padding: 0 2px; }
.fade-runnable__varval:hover { background: #2a2d2e; }
.fade-runnable__var-edit { width: 90px; background: #1e1e1e; color: #d4d4d4; border: 1px solid #007acc; border-radius: 3px; padding: 0 3px; font: inherit; font-size: 12px; }
.fade-runnable__watch-item { display: flex; gap: 8px; padding: 1px 8px; align-items: center; }
.fade-runnable__watch-item:hover { background: #2a2d2e; }
.fade-runnable__watch-expr { color: #9CDCFE; }
.fade-runnable__watch-val { color: #B5CEA8; margin-left: auto; }
.fade-runnable__watch-val--err { color: #f14c4c; font-style: italic; }
.fade-runnable__watch-add { width: 100%; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3a3a3a; border-radius: 4px; padding: 2px 6px; font: inherit; font-size: 12px; margin-bottom: 4px; }
.fade-runnable__frame { display: flex; gap: 6px; padding: 2px 8px; cursor: pointer; }
.fade-runnable__frame:hover { background: #2a2d2e; }
.fade-runnable__frame--active { background: #37373d; }
.fade-runnable__frame-name { color: #dcdcaa; }
.fade-runnable__frame-line { color: #888; margin-left: auto; }
.fade-runnable__bp { display: flex; align-items: center; gap: 6px; padding: 2px 8px; }
.fade-runnable__bp:hover { background: #2a2d2e; }
.fade-runnable__bp-dot { width: 9px; height: 9px; border-radius: 50%; background: #e51400; flex: none; }
.fade-runnable__bp-line { color: #d4d4d4; }
.fade-runnable__row-remove { flex: 0 0 auto; width: auto; margin-left: auto; cursor: pointer; background: transparent; color: #888; border: 0; display: inline-flex; }
.fade-runnable__row-remove:hover { color: #f14c4c; }
/* Combined Output + Debug Console */
.fade-runnable__console { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid #333; }
.fade-runnable__repl-log { overflow: auto; white-space: pre-wrap; padding: 2px 8px; max-height: 90px; }
.fade-runnable__repl-log:empty { display: none; }
.fade-runnable__repl-line--in { color: #9CDCFE; }
.fade-runnable__repl-line--out { color: #d4d4d4; }
.fade-runnable__repl-line--err { color: #f14c4c; }
.fade-runnable__repl-row { display: flex; align-items: center; gap: 6px; border-top: 1px solid #2b2b2b; padding: 4px 8px; }
.fade-runnable__repl-prompt { color: #6a9955; }
.fade-runnable__repl-input { flex: 1; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3a3a3a; border-radius: 4px; padding: 3px 6px; font: inherit; font-size: 12px; }
.fade-runnable__repl-input:disabled { opacity: 0.5; }
/* IDE layout — mini VSCode */
.fade-runnable--ide { display: grid; height: min(80vh, 900px); min-height: 480px; grid-template-columns: 260px 1fr; grid-template-rows: auto 1fr minmax(140px, 26%); grid-template-areas: "toolbar toolbar" "sidebar editor" "bottom bottom"; }
.fade-runnable--ide .fade-runnable__toolbar { grid-area: toolbar; border-top: 0; border-bottom: 1px solid #333; }
.fade-runnable--ide .fade-runnable__sidebar { grid-area: sidebar; overflow: auto; border-right: 1px solid #333; border-top: 0; }
.fade-runnable--ide .fade-runnable__pane-editor { grid-area: editor; height: 100%; }
.fade-runnable--ide .fade-runnable__console { grid-area: bottom; min-height: 0; }
.fade-runnable--ide .fade-runnable__vm { flex: 1; height: auto; }
.fade-runnable--ide .fade-runnable__status { padding: 0 10px 0 4px; }
`;
    document.head.appendChild(style);
}

if (typeof customElements !== 'undefined' && !customElements.get('fade-runnable')) {
    customElements.define('fade-runnable', FadeRunnableElement);
}
