// Arm the MonoGame (KNI / Blazor) preview iframe and attach it to a FadeRunner
// as the VM target. The MonoGame runtime speaks the SAME wire protocol as the
// web VM (run-start-source, debug-start, debug-set-breakpoints, debug-event, …),
// so once armed the runner drives it with all the normal run/debug methods — no
// separate bridge needed. Only the boot handshake differs: preview-ready →
// bootstrap → preview-armed, then pg-splash-hidden to unpause the render loop.
// (The game canvas lives inside the iframe.)

import type { FadeRunner } from '@fadebasic/runtime';

function waitForMessage(frame: HTMLIFrameElement, type: string, timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            window.removeEventListener('message', onMsg);
            reject(new Error(`monogame-preview: timed out waiting for "${type}"`));
        }, timeoutMs);
        const onMsg = (e: MessageEvent) => {
            if (e.source !== frame.contentWindow) return;
            if (e.data?.type !== type) return;
            clearTimeout(timer);
            window.removeEventListener('message', onMsg);
            resolve();
        };
        window.addEventListener('message', onMsg);
    });
}

/** Load + bootstrap the MonoGame preview iframe and attach it to the runner.
 *  Resolves once the runner can run/debug programs against the canvas. */
export async function armMonoGamePreview(
    runner: FadeRunner,
    frame: HTMLIFrameElement,
    assetBase: string,
): Promise<void> {
    const base = assetBase.replace(/\/*$/, '/');
    const ready = waitForMessage(frame, 'preview-ready');
    frame.src = `${base}monogame/index.html?preview=1`;
    await ready;

    // The MonoGame template statically references its command libraries, so the
    // bootstrap command set is ignored — we still send it to drive the iframe
    // through its armed state.
    const armed = waitForMessage(frame, 'preview-armed');
    frame.contentWindow!.postMessage({ type: 'bootstrap', commandDlls: [] }, '*');
    await armed;

    // Register the bundled default assets (ghost image, font, sound effects) so
    // the docs' example programs can `texture "ghost"` / `font "font"` /
    // `load sfx clip "jump"` against real content. Done BEFORE attachVmIframe so
    // the id-correlated register-audio replies don't race the runner's listener.
    await registerDefaultAssets(frame, base);

    // Unpause the render loop (the preview page parks its rAF until the host
    // signals the boot splash is gone).
    frame.contentWindow!.postMessage({ type: 'pg-splash-hidden' }, '*');

    runner.attachVmIframe(frame);
}

/** Fetch assets/assets-manifest.json and push each asset into the game iframe:
 *  XNBs (image/font) via `register-asset`, raw audio via `register-audio`.
 *  Best-effort — a missing manifest (e.g. assets not staged) is a no-op, and a
 *  single bad asset never blocks the rest. */
async function registerDefaultAssets(frame: HTMLIFrameElement, base: string): Promise<void> {
    let manifest: Array<{ name: string; kind: 'xnb' | 'audio'; file: string }>;
    try {
        const res = await fetch(`${base}assets/assets-manifest.json`);
        if (!res.ok) return;
        manifest = await res.json();
    } catch { return; }

    const win = frame.contentWindow!;
    const audioWaits: Promise<void>[] = [];
    let audioId = 900_000;   // high base so it can't collide with runner ids
    for (const a of manifest) {
        try {
            const bytes = new Uint8Array(await (await fetch(`${base}assets/${a.file}`)).arrayBuffer());
            if (a.kind === 'audio') {
                const id = ++audioId;
                audioWaits.push(waitForAudioResult(frame, id));
                win.postMessage({ type: 'register-audio', name: a.name, bytes, id }, '*');
            } else {
                win.postMessage({ type: 'register-asset', name: a.name, bytes }, '*');
            }
        } catch { /* skip a bad asset, keep the rest */ }
    }
    // Wait for audio decodes so the first `play sfx` after Run isn't silent.
    await Promise.allSettled(audioWaits);
}

/** Resolve when the iframe replies register-audio-result for `id` (or times out). */
function waitForAudioResult(frame: HTMLIFrameElement, id: number, timeoutMs = 15_000): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => { window.removeEventListener('message', onMsg); resolve(); }, timeoutMs);
        const onMsg = (e: MessageEvent) => {
            if (e.source !== frame.contentWindow) return;
            if (e.data?.type !== 'register-audio-result' || e.data?.id !== id) return;
            clearTimeout(timer);
            window.removeEventListener('message', onMsg);
            resolve();
        };
        window.addEventListener('message', onMsg);
    });
}
