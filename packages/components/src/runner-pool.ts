// One LSP worker per (asset base, kind), shared by every Fade component of that
// kind on the page. Each worker is a full .NET WASM runtime (tens of MB); a docs
// page with 100+ snippets would OOM with one worker each. The worker is multi-
// document (keyed by URI), so one serves all editors' highlighting/diagnostics
// and all snippet-tokenization.
//
// Web and MonoGame get SEPARATE workers on purpose: registering both the web
// command library and the MonoGame set on ONE worker makes commands that exist
// in both (e.g. `print`) ambiguous, which the LSP reports as an error — a false
// red squiggle on valid code. Keeping the command sets on distinct workers (each
// mirroring its Playground project type) keeps diagnostics clean.

import { FadeRunner } from '@fadebasic/runtime';

const runners = new Map<string, FadeRunner>();
const lspReady = new Map<string, Promise<void>>();
const monoLspReady = new Map<string, Promise<void>>();

export function getSharedRunner(assetBase: string, kind: 'web' | 'monogame' = 'web'): FadeRunner {
    const key = `${assetBase}#${kind}`;
    let r = runners.get(key);
    if (!r) {
        r = new FadeRunner({
            assetBase,
            onPrint: () => { /* print renders inside the preview iframe */ },
            onAlert: (msg) => console.warn('[fade] alert:', msg),
        });
        runners.set(key, r);
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

// Apply a set of LSP TextEdits to a source string. Edits are applied
// end-to-start so earlier offsets stay valid as later ones splice in.
function applyTextEdits(source: string, edits: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string }>): string {
    if (!edits.length) return source;
    const lineStarts: number[] = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
    const off = (line: number, ch: number) => (lineStarts[line] ?? source.length) + ch;
    const sorted = [...edits].sort((a, b) => off(b.range.start.line, b.range.start.character) - off(a.range.start.line, a.range.start.character));
    let text = source;
    for (const e of sorted) {
        const s = off(e.range.start.line, e.range.start.character);
        const en = off(e.range.end.line, e.range.end.character);
        text = text.slice(0, s) + e.newText + text.slice(en);
    }
    return text;
}

let fmtCounter = 0;
/** Format a Fade source string through the shared LSP's document formatter
 *  (the same engine the Playground uses). Command-aware: pass mono=true for
 *  MonoGame snippets so game commands parse. Falls back to the input on any
 *  failure, so a snippet never renders blank. */
export async function formatFadeSource(assetBase: string, source: string, mono = false): Promise<string> {
    try {
        const runner = getSharedRunner(assetBase, mono ? 'monogame' : 'web');
        await (mono ? getMonoLspReady(runner, assetBase) : getLspReady(runner, assetBase));
        const uri = `mem://fade-fmt-${++fmtCounter}.fbasic`;
        runner.setDocument(uri, source);
        const edits = await runner.format(uri, { tabSize: 4, insertSpaces: true, casing: 0 });
        const out = applyTextEdits(source, edits);
        return out && out.trim() ? out.replace(/\s+$/, '') : source;
    } catch {
        return source;
    }
}

// Configure a MonoGame LSP worker (its OWN runner from getSharedRunner(…,
// 'monogame')). Mirrors the Playground's monogame project exactly: set the
// project type to 'monogame', preload the referenced assemblies so the command
// class resolves in the LSP's AppDomain, then register Fade.MonoGame.Lib as the
// command source. Crucially it does NOT register WebCommands — that would make
// shared command names ambiguous and produce false error squiggles. This gives
// game snippets correct command highlighting AND accurate diagnostics.
export function getMonoLspReady(runner: FadeRunner, assetBase: string): Promise<void> {
    let ready = monoLspReady.get(assetBase);
    if (!ready) {
        const base = assetBase.replace(/\/*$/, '/');
        ready = (async () => {
            await runner.setProjectType('monogame');
            // Preloaded for referenced-assembly resolution when the command
            // class is instantiated — not registered as command sources.
            for (const name of ['Fade.MonoGame.Contracts', 'Fade.MonoGame.Game']) {
                try {
                    const resp = await fetch(`${base}fade-libs/${name}.dll`);
                    if (resp.ok) await runner.loadAssembly(await resp.arrayBuffer());
                } catch { /* non-fatal — resolution may still succeed */ }
            }
            try {
                const resp = await fetch(`${base}fade-libs/Fade.MonoGame.Lib.dll`);
                if (resp.ok) {
                    await runner.registerCommandAssembly(await resp.arrayBuffer(), 'Fade.MonoGame.Lib.FadeMonoGameCommands');
                }
            } catch { /* offline — game commands tokenize generically, non-fatal */ }
        })();
        monoLspReady.set(assetBase, ready);
    }
    return ready;
}
