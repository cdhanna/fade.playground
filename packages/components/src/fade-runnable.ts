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
            if (this.hasAttribute('autorun')) void this.run();
        }
    }

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
`;
    document.head.appendChild(style);
}

if (typeof customElements !== 'undefined' && !customElements.get('fade-runnable')) {
    customElements.define('fade-runnable', FadeRunnableElement);
}
