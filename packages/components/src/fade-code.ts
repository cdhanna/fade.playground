// <fade-code> — a static, auto-height, syntax-highlighted Fade code block
// (like a Markdown code fence). No monaco, no run — ideal for read-only doc
// fragments (and the Playground's Help examples). Renders instantly with the
// dependency-free highlighter, then upgrades to LSP semantic tokens (which know
// commands like `print`) via the shared worker.

import { highlightFadeStatic, renderTokenizedSnippet, injectSnippetCss } from '@fadebasic/editor';
import { getSharedRunner, getLspReady } from './runner-pool';

export class FadeCodeElement extends HTMLElement {
    private _code?: string;
    private io?: IntersectionObserver;

    get code(): string { return this._code ?? ''; }
    set code(v: string) { this._code = v; if (this.isConnected) this.render(); }

    connectedCallback(): void {
        injectStyles();
        injectSnippetCss();
        this.render();
    }

    disconnectedCallback(): void {
        this.io?.disconnect();
        this.io = undefined;
    }

    private render(): void {
        const source = (this._code ?? this.getAttribute('code') ?? dedent(this.textContent ?? '')).replace(/\s+$/, '');
        const assetBase = this.getAttribute('asset-base') ?? '/runtime/';

        // `commands` attr: extra command words to color as commands — for
        // snippets whose commands come from a runtime we don't load here (e.g.
        // MonoGame). Comma/space separated.
        const cmdAttr = this.getAttribute('commands');
        const cmds = cmdAttr
            ? new Set(cmdAttr.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))
            : undefined;

        // Instant coloring (keywords/strings/numbers, + any supplied commands)
        // so there's no flash of unstyled code before the LSP responds.
        this.innerHTML = `<pre class="fade-code__pre"><code>${highlightFadeStatic(source, cmds)}</code></pre>`;
        const codeEl = this.querySelector('code')!;

        // With custom commands, keep the static coloring: the LSP only knows the
        // web command set and would re-tokenize those words back to plain
        // identifiers. (Display-only block, so no diagnostics are needed.)
        if (cmds && cmds.size) return;

        // Upgrade to full semantic highlighting (command-aware) via the LSP —
        // but LAZILY. A docs page can have 100+ blocks; tokenizing them all up
        // front serializes 100+ calls through the one shared worker and feels
        // slow. Only upgrade blocks as they scroll into view. The static
        // coloring already covers everything off-screen.
        const upgrade = () => {
            const runner = getSharedRunner(assetBase);
            void getLspReady(runner, assetBase)
                .then(() => runner.tokenizeSnippet(source))
                .then((tokens) => { if (tokens.length && this.isConnected) codeEl.innerHTML = renderTokenizedSnippet(source, tokens); })
                .catch(() => { /* keep the static coloring */ });
        };

        if (typeof IntersectionObserver === 'undefined') { upgrade(); return; }
        this.io?.disconnect();
        this.io = new IntersectionObserver((entries, obs) => {
            if (entries.some((e) => e.isIntersecting)) { obs.disconnect(); this.io = undefined; upgrade(); }
        }, { rootMargin: '200px' });
        this.io.observe(this);
    }
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
    style.setAttribute('data-fade-code', '');
    style.textContent = `
.fade-code__pre { margin: 0; background: #1e1e1e; color: #d4d4d4; padding: 10px 12px; border-radius: 6px; border: 1px solid #333; overflow-x: auto; }
fade-code code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.5; white-space: pre; }
`;
    document.head.appendChild(style);
}

if (typeof customElements !== 'undefined' && !customElements.get('fade-code')) {
    customElements.define('fade-code', FadeCodeElement);
}
