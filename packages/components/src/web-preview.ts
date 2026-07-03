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

    // Bootstrap the standard web command library. FadeBasic.Lib.Web implements
    // the everyday commands (print, str$, math, …); the LSP knows them at
    // compile time, but the VM iframe needs the DLL *loaded* to bind them at
    // runtime — without it `print` compiles but is a no-op. This mirrors the
    // Playground's collectCommandDllEntries web default.
    const commandDlls: { assembly: string; class: string; bytes: ArrayBuffer }[] = [];
    try {
        const resp = await fetch(`${base}fade-libs/FadeBasic.Lib.Web.dll`);
        if (resp.ok) {
            commandDlls.push({
                assembly: 'FadeBasic.Lib.Web',
                class: 'FadeBasic.Lib.Web.WebCommands',
                bytes: await resp.arrayBuffer(),
            });
        }
    } catch { /* offline / missing — arm with no commands, print will no-op */ }

    const armed = waitForMessage(frame, 'preview-armed');
    frame.contentWindow!.postMessage(
        { type: 'bootstrap', commandDlls },
        '*',
        commandDlls.map((c) => c.bytes),
    );
    await armed;

    runner.attachVmIframe(frame);
}
