// Arm the web VM iframe so a FadeRunner can execute programs through it.
// Mirrors the Playground's ensureWebPreviewArmed handshake (main.ts): point the
// iframe at the runtime's preview page, wait for it to report ready, bootstrap
// it (empty command set is enough for standard commands like `print`), wait for
// armed, then hand the iframe to the runner as its VM target.

import type { FadeRunner } from '@fadebasic/runtime';

function waitForMessage(frame: HTMLIFrameElement, type: string, timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            window.removeEventListener('message', onMsg);
            reject(new Error(`web-preview: timed out waiting for "${type}"`));
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

/** Load + bootstrap the preview iframe and attach it to the runner as the VM
 *  target. Resolves once the runner can execute programs. */
export async function armWebPreview(
    runner: FadeRunner,
    frame: HTMLIFrameElement,
    assetBase: string,
): Promise<void> {
    const base = assetBase.replace(/\/*$/, '/');
    const ready = waitForMessage(frame, 'preview-ready');
    frame.src = `${base}web/index.html?preview=1`;
    await ready;

    const armed = waitForMessage(frame, 'preview-armed');
    // Empty command set — standard commands (print, math, strings) live in the
    // core runtime. Embeds needing extra libraries can extend this later.
    frame.contentWindow!.postMessage({ type: 'bootstrap', commandDlls: [] }, '*');
    await armed;

    runner.attachVmIframe(frame);
}
