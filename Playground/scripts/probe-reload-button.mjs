// Probe: the MAIN-IDE Reload button (Layer 4b).
//
// Builds on probe-reload.mjs (which proves the wire path) and verifies the UI:
//   - #reload is hidden while the buffer matches the running program
//   - editing the buffer reveals #reload (divergence detected via the live model)
//   - clicking #reload arms the diff; the live VM applies it (status → NoChange)
//   - #reload hides again once the running source catches up
//
// Requires the dev server up (HTTPS, self-signed):
//     npm run dev                        # serves :5311
//     node scripts/probe-reload-button.mjs
//
// Exit 0 on pass; prints a ── VERDICT ── block and exits 1 on failure.
import { chromium } from 'playwright';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const fail = (msg) => { console.error('\n── VERDICT ──\nFAIL: ' + msg); process.exit(1); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const logs = [];
page.on('pageerror', (e) => logs.push('[PE] ' + e.message));
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));

const RUNNING = 'n as integer\nm as integer\nn = 0\ndo\n  n = n + 1\n  m = n * 2\nloop\n';
const EDITED  = 'n as integer\nm as integer\nn = 0\ndo\n  n = n + 1\n  m = n * 3\nloop\n';
// The reload button is SHOWN while running: disabled when nothing to reload,
// enabled when the buffer diverges. (It's no longer hidden-on-no-divergence.)
const reloadState = () => page.evaluate(() => {
    const b = document.getElementById('reload');
    return { shown: !!b && getComputedStyle(b).display !== 'none', disabled: !!b?.hasAttribute('disabled') };
});

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (src) => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('reloadbtnprobe', { create: true });
        const write = async (n, t) => {
            const fh = await dir.getFileHandle(n, { create: true });
            const w = await fh.createWritable(); await w.write(t); await w.close();
        };
        await write('fade.json', JSON.stringify({
            $schema: '/fade.schema.json', name: 'reloadbtnprobe', type: 'web',
            commandDlls: [], sources: ['main.fbasic'],
        }) + '\n');
        await write('main.fbasic', src);
        localStorage.setItem('fade.activeProject', 'reloadbtnprobe');
        localStorage.setItem('fade.launchMode', 'run');
        localStorage.setItem('fade.autoHotReload', 'false');
    }, RUNNING);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers?.armReload, { timeout: 90_000 });

    // Start the program.
    await page.click('#launch');
    await new Promise((r) => setTimeout(r, 1500));

    // 1) While running with no divergence: shown but DISABLED.
    {
        const s = await reloadState();
        if (!s.shown || !s.disabled) fail(`pre-edit reload button should be shown+disabled, got ${JSON.stringify(s)}`);
    }
    console.log('reload shown+disabled pre-edit ✓');

    // 2) Edit the live model → divergence → Reload becomes ENABLED.
    await page.evaluate((src) => {
        const uri = window.monaco.Uri.file('/workspace/main.fbasic');
        const model = window.monaco.editor.getModel(uri);
        if (!model) throw new Error('no model for main.fbasic');
        model.setValue(src);
    }, EDITED);
    await page.waitForFunction(
        () => { const b = document.getElementById('reload'); return b && getComputedStyle(b).display !== 'none' && !b.hasAttribute('disabled'); },
        { timeout: 10_000 },
    ).catch(() => fail('Reload button never enabled after editing the buffer'));
    console.log('reload enabled after edit ✓');

    // 3) Click Reload → arms the diff; the live VM applies it.
    await page.click('#reload');
    let applied = false;
    for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const st = await page.evaluate(() => window.__fadeRunnerHelpers.reloadStatus());
        if (st && st.verdict === 'NoChange') { applied = true; break; }
        if (st && st.verdict === 'PermanentlyRude')
            fail(`body edit unexpectedly PermanentlyRude: ${JSON.stringify(st)}`);
    }
    if (!applied) fail('reload never applied (status never returned to NoChange)');
    console.log('reload applied (status NoChange) ✓');

    // 4) Back to shown+DISABLED — running source now matches the buffer.
    await page.waitForFunction(
        () => { const b = document.getElementById('reload'); return b && getComputedStyle(b).display !== 'none' && b.hasAttribute('disabled'); },
        { timeout: 10_000 },
    ).catch(() => fail('Reload button should be disabled again after a successful reload'));
    console.log('reload shown+disabled post-apply ✓');

    console.log('\n── VERDICT ──\nPASS: Reload button disabled with no divergence, enables on edit, applies, disables again');
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    console.error('recent console:\n' + logs.slice(-25).join('\n'));
    await browser.close();
    process.exit(1);
}
