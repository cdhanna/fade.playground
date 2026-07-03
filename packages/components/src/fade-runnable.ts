// <fade-runnable> — an editable Fade snippet with a Run button and an output
// pane, backed by @fadebasic/runtime + @fadebasic/editor. Framework-agnostic
// custom element: drops into Svelte, plain HTML, or MDX; many per page.
//
// Source is taken from the `code` property (preferred for generated pages —
// dodges HTML/JSX brace parsing) or the element's text content (hand-authored).
// Attributes: asset-base (default '/runtime/'), readonly, autorun, no-run.

import { FadeRunner } from '@fadebasic/runtime';
import { createFadeEditor, type FadeEditor } from '@fadebasic/editor';
import { armWebPreview } from './web-preview';
import { getSharedRunner, getLspReady } from './runner-pool';

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
    private breakpoints = new Set<number>(); // 1-based lines
    private debugBar?: HTMLElement;
    private varsEl?: HTMLElement;

    /** Preferred way to set source from generated code (no HTML escaping). */
    get code(): string { return this.fadeEditor?.getValue() ?? this._code ?? ''; }
    set code(v: string) {
        this._code = v;
        if (this.fadeEditor) this.fadeEditor.setValue(v);
    }

    connectedCallback(): void {
        if (this.fadeEditor) return; // already mounted
        injectStyles();
        // Source precedence: `code` property (set by frameworks / generators),
        // then a `code` attribute, then slotted text (hand-authored HTML).
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

        // The runtime renders program output (print/graphics) inside the
        // preview iframe itself — it does NOT forward `print` to the parent
        // (see the runtime's index.html internalOnly set). So the iframe *is*
        // the output surface; we show it, sized, below the toolbar. Only
        // created for runnable snippets.
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
            this.iframe = document.createElement('iframe');
            this.iframe.className = 'fade-runnable__vm';
            this.iframe.setAttribute('title', 'Fade output');
            this.append(this.iframe);

            this.runBtn = el('button', 'fade-runnable__run') as HTMLButtonElement;
            this.runBtn.type = 'button';
            this.runBtn.textContent = '▶ Run';
            this.runBtn.addEventListener('click', () => void this.run());
            toolbar.append(this.runBtn);

            if (this.debugEnabled) this.setupDebug(toolbar);
            if (this.hasAttribute('autorun')) void this.run();
        }
    }

    // ── Debug ─────────────────────────────────────────────────────────────
    private setupDebug(toolbar: HTMLElement): void {
        // Breakpoint gutter: click the glyph margin to toggle a breakpoint.
        this.fadeEditor!.onBreakpointToggle((line) => {
            if (this.breakpoints.has(line)) this.breakpoints.delete(line);
            else this.breakpoints.add(line);
            this.fadeEditor!.setBreakpointLines([...this.breakpoints]);
            if (this.debugging) void this.pushBreakpoints();
        });

        const debugBtn = el('button', 'fade-runnable__debug') as HTMLButtonElement;
        debugBtn.type = 'button';
        debugBtn.textContent = '🐞 Debug';
        debugBtn.title = 'Set a breakpoint in the gutter, then Debug';
        debugBtn.addEventListener('click', () => void this.startDebug());
        toolbar.append(debugBtn);

        // Step controls — hidden until a session is paused.
        this.debugBar = el('span', 'fade-runnable__debugbar');
        const mk = (label: string, title: string, fn: () => void) => {
            const b = el('button', 'fade-runnable__stepbtn') as HTMLButtonElement;
            b.type = 'button'; b.textContent = label; b.title = title;
            b.addEventListener('click', fn);
            this.debugBar!.append(b);
        };
        mk('▶', 'Continue (F5)', () => void this.runner!.debugContinue().then(() => this.onResumed()));
        mk('⤼', 'Step Over', () => void this.runner!.debugStep('over').then(() => this.onResumed()));
        mk('⤸', 'Step Into', () => void this.runner!.debugStep('in').then(() => this.onResumed()));
        mk('⤾', 'Step Out', () => void this.runner!.debugStep('out').then(() => this.onResumed()));
        mk('■', 'Stop', () => void this.stopDebug());
        this.debugBar.style.display = 'none';
        toolbar.append(this.debugBar);

        this.varsEl = el('div', 'fade-runnable__vars');
        this.varsEl.style.display = 'none';
        this.append(this.varsEl);
    }

    private async startDebug(): Promise<void> {
        if (this.debugging || !this.runner || !this.iframe) return;
        this.debugging = true;
        this.setStatus('Loading runtime…', 'out');
        try {
            if (!this.armed) { await armWebPreview(this.runner, this.iframe, this.assetBase()); this.armed = true; }
            // Route the shared runner's debug events to this element while it drives.
            this.runner.onDebugEvent = (ev) => void this.onDebugEvent(ev);
            this.setStatus('Debugging — paused at breakpoints', 'out');
            if (this.debugBar) this.debugBar.style.display = 'inline-flex';
            await this.runner.debugStart(this.fadeEditor!.getValue());
            await this.pushBreakpoints();
            await this.runner.debugContinue(); // run to the first breakpoint (or completion)
        } catch (e) {
            this.setStatus(e instanceof Error ? e.message : String(e), 'error');
            this.stopDebug();
        }
    }

    private async pushBreakpoints(): Promise<void> {
        // Editor lines are 1-based; the runtime wants 0-based.
        await this.runner!.debugSetBreakpoints([...this.breakpoints].map((ln) => ({ line: ln - 1, column: 0 })));
    }

    private onResumed(): void {
        this.fadeEditor!.setCurrentLine(null);
        if (this.varsEl) this.varsEl.style.display = 'none';
    }

    private async onDebugEvent(ev: { type: string }): Promise<void> {
        if (ev.type === 'REV_REQUEST_BREAKPOINT') {
            // Paused. Highlight the top frame's line + show its variables.
            const framesRes: any = await this.runner!.debugStackFrames();
            const frames = Array.isArray(framesRes) ? framesRes : (framesRes?.stackFrames ?? []);
            const line = frames[0]?.lineNumber;
            if (typeof line === 'number') this.fadeEditor!.setCurrentLine(line + 1);
            try { this.renderVars(await this.runner!.debugScopes(0)); } catch { /* ignore */ }
        } else if (ev.type === 'REV_REQUEST_EXITED' || ev.type === 'complete' || ev.type === 'error') {
            this.stopDebug();
        }
    }

    private renderVars(scopesRes: any): void {
        if (!this.varsEl) return;
        const scopes = scopesRes?.scopes ?? [];
        const rows: string[] = [];
        for (const sc of scopes) {
            for (const v of (sc.variables ?? [])) {
                rows.push(`<div class="fade-runnable__var"><span class="fade-runnable__varname">${escapeHtml(v.name)}</span> <span class="fade-runnable__varval">${escapeHtml(String(v.value))}</span></div>`);
            }
        }
        this.varsEl.innerHTML = rows.length ? rows.join('') : '<div class="fade-runnable__var">(no variables in scope)</div>';
        this.varsEl.style.display = 'block';
    }

    private stopDebug(): void {
        if (this.runner) { void this.runner.debugTerminate().catch(() => {}); this.runner.onDebugEvent = undefined; }
        this.debugging = false;
        this.fadeEditor?.setCurrentLine(null);
        if (this.debugBar) this.debugBar.style.display = 'none';
        if (this.varsEl) this.varsEl.style.display = 'none';
        this.setStatus('', 'out');
    }

    private assetBase(): string { return this.getAttribute('asset-base') ?? '/runtime/'; }

    disconnectedCallback(): void {
        this.fadeEditor?.dispose();
        this.fadeEditor = undefined;
    }

    async run(): Promise<void> {
        if (this.running || !this.runner || !this.iframe) return;
        this.running = true;
        if (this.runBtn) { this.runBtn.disabled = true; this.runBtn.textContent = '… Running'; }
        this.setStatus('', 'out');
        try {
            if (!this.armed) {
                const base = this.getAttribute('asset-base') ?? '/runtime/';
                this.setStatus('Loading runtime…', 'out');
                await armWebPreview(this.runner, this.iframe, base);
                this.armed = true;
                this.setStatus('', 'out');
            }
            // The iframe renders print output live. The resolved envelope
            // reports compile / runtime errors, which the iframe doesn't show.
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

    private setStatus(text: string, kind: 'out' | 'error'): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = `fade-runnable__status fade-runnable__status--${kind}`;
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function el(tag: string, className: string): HTMLElement {
    const e = document.createElement(tag);
    e.className = className;
    return e;
}

/** Strip the common leading indentation from slotted HTML source. */
function dedent(s: string): string {
    const lines = s.replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
    const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
    return lines.map((l) => l.slice(indent)).join('\n');
}

let stylesInjected = false;
function injectStyles(): void {
    if (stylesInjected || typeof document === 'undefined') return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-fade-runnable', '');
    style.textContent = `
.fade-runnable { display: block; border: 1px solid #333; border-radius: 6px; overflow: hidden; background: #1e1e1e; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.fade-runnable__editor { height: 220px; }
.fade-runnable__toolbar { display: flex; gap: 8px; padding: 6px 8px; background: #252526; border-top: 1px solid #333; }
.fade-runnable__run { cursor: pointer; background: #0e639c; color: #fff; border: 0; border-radius: 4px; padding: 4px 12px; font: inherit; font-size: 13px; }
.fade-runnable__run:hover:not(:disabled) { background: #1177bb; }
.fade-runnable__run:disabled { opacity: 0.6; cursor: default; }
.fade-runnable__status { padding: 6px 8px; color: #d4d4d4; font-size: 13px; white-space: pre-wrap; }
.fade-runnable__status:empty { display: none; }
.fade-runnable__status--error { color: #f14c4c; }
.fade-runnable__vm { display: block; width: 100%; height: 160px; border: 0; border-top: 1px solid #333; background: #1e1e1e; }
.fade-runnable__debug { cursor: pointer; background: #3a3d41; color: #fff; border: 0; border-radius: 4px; padding: 4px 12px; font: inherit; font-size: 13px; }
.fade-runnable__debug:hover { background: #4a4d51; }
.fade-runnable__debugbar { display: inline-flex; gap: 4px; align-items: center; }
.fade-runnable__stepbtn { cursor: pointer; background: #2d2d2d; color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 2px 8px; font: inherit; font-size: 13px; line-height: 1.4; }
.fade-runnable__stepbtn:hover { background: #3a3a3a; }
.fade-runnable__vars { border-top: 1px solid #333; padding: 8px; background: #1b1b1b; color: #d4d4d4; font-size: 12px; max-height: 160px; overflow: auto; }
.fade-runnable__var { display: flex; gap: 8px; padding: 1px 0; }
.fade-runnable__varname { color: #9CDCFE; }
.fade-runnable__varval { color: #B5CEA8; }
`;
    document.head.appendChild(style);
}

if (typeof customElements !== 'undefined' && !customElements.get('fade-runnable')) {
    customElements.define('fade-runnable', FadeRunnableElement);
}
