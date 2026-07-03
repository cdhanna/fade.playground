// One LSP worker per asset base, shared by every Fade component on the page.
// Each worker is a full .NET WASM runtime (tens of MB); a docs page with 100+
// snippets would OOM with one worker each. The worker is multi-document (keyed
// by URI), so one serves all editors' highlighting/diagnostics and all
// snippet-tokenization.

import { FadeRunner } from '@fadebasic/runtime';

const runners = new Map<string, FadeRunner>();
const lspReady = new Map<string, Promise<void>>();

export function getSharedRunner(assetBase: string): FadeRunner {
    let r = runners.get(assetBase);
    if (!r) {
        r = new FadeRunner({
            assetBase,
            onPrint: () => { /* web print renders inside the preview iframe */ },
            onAlert: (msg) => console.warn('[fade] alert:', msg),
        });
        runners.set(assetBase, r);
    }
    return r;
}

// Make the shared LSP command-aware (once per asset base): set the project type
// and register the standard web command library, so commands like `print`
// tokenize as commands rather than generic identifiers. Mirrors the Playground's
// setProjectType + registerCommandAssembly.
export function getLspReady(runner: FadeRunner, assetBase: string): Promise<void> {
    let ready = lspReady.get(assetBase);
    if (!ready) {
        const base = assetBase.replace(/\/*$/, '/');
        ready = (async () => {
            await runner.setProjectType('web');
            try {
                const resp = await fetch(`${base}fade-libs/FadeBasic.Lib.Web.dll`);
                if (resp.ok) {
                    await runner.registerCommandAssembly(await resp.arrayBuffer(), 'FadeBasic.Lib.Web.WebCommands');
                }
            } catch { /* offline — commands tokenize generically, non-fatal */ }
        })();
        lspReady.set(assetBase, ready);
    }
    return ready;
}
