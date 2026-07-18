// Probe: Playground hot-reload wire path (Layers 1–3).
//
// Verifies, through the REAL browser + Export.Web WASM, that arming a reload
// against a running web program classifies correctly:
//   - a body edit          → ApplicableNow  (state-preserving reload possible)
//   - a global type change → PermanentlyRude (needs a full Run/restart)
//
// Requires the dev server up AND the Export.Web runtime staged with the
// ReloadArm/ReloadStatus JSExports + runtime.js reload-arm handler:
//     npm run dev                 # in one terminal (serves :5311)
//     node scripts/probe-reload.mjs
//
// Exit 0 on pass; prints a ── VERDICT ── block and exits 1 on failure.
import { chromium } from 'playwright';

// Dev server runs HTTPS with a self-signed cert (basicSsl, for WebRTC), so
// default to https + ignore the cert error.
const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const fail = (msg) => { console.error('\n── VERDICT ──\nFAIL: ' + msg); process.exit(1); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const logs = [];
page.on('pageerror', (e) => logs.push('[PE] ' + e.message));
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // Seed a web project with an infinite loop that mutates a global — gives a
    // live, running program to reload against. (No wait for bootstrap here — the
    // first load lands on the welcome screen with no active project, so the app
    // only fully boots after the reload below.)
    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('reloadprobe', { create: true });
        const write = async (n, t) => {
            const fh = await dir.getFileHandle(n, { create: true });
            const w = await fh.createWritable(); await w.write(t); await w.close();
        };
        await write('fade.json', JSON.stringify({
            $schema: '/fade.schema.json', name: 'reloadprobe', type: 'web',
            commandDlls: [], sources: ['main.fbasic'],
        }) + '\n');
        // A MULTI-statement loop is required: a body edit becomes ApplicableNow
        // only at a safepoint where the edited statement is NOT the active one.
        // A single-statement loop (do / n=n+1 / loop) sits on the edited statement
        // at every boundary, so it could never drain — correct hot-reload
        // semantics, but untestable. Here the edit targets `m = n * 2`, which is
        // inactive whenever the VM is paused at `n = n + 1` or the loop-back.
        await write('main.fbasic', 'n as integer\nm as integer\nn = 0\ndo\n  n = n + 1\n  m = n * 2\nloop\n');
        localStorage.setItem('fade.activeProject', 'reloadprobe');
        localStorage.setItem('fade.launchMode', 'run');
        localStorage.setItem('fade.autoHotReload', 'false');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers?.armReload, { timeout: 90_000 });

    // Start the program (the #launch button (run mode) drives runner.run).
    await page.click('#launch');
    await new Promise((r) => setTimeout(r, 1500)); // let it run a bit (n climbs)

    // 1) body edit → drains to applied. armReload's immediate verdict is
    //    ApplicableNow or PendingTransient depending on where the free-running
    //    VM happens to be; either is correct. What we assert is that RunTick's
    //    deferred-commit actually APPLIES it — the status flips to NoChange
    //    (HasPending clears) once the swap lands at a clean boundary.
    const bodyEdit = 'n as integer\nm as integer\nn = 0\ndo\n  n = n + 1\n  m = n * 3\nloop\n';
    const armed = await page.evaluate((src) => window.__fadeRunnerHelpers.armReload({ source: src }), bodyEdit);
    console.log('body-edit arm verdict:', JSON.stringify(armed));
    if (!armed || (armed.verdict !== 'ApplicableNow' && armed.verdict !== 'PendingTransient'))
        fail(`body edit expected ApplicableNow/PendingTransient, got ${JSON.stringify(armed)}`);

    // Poll for the deferred commit to land.
    let applied = null;
    for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 100)); // let RunTick drain + apply
        const st = await page.evaluate(() => window.__fadeRunnerHelpers.reloadStatus());
        if (st && st.verdict === 'NoChange') { applied = st; break; }
        if (st && st.verdict === 'PermanentlyRude')
            fail(`body edit unexpectedly went PermanentlyRude: ${JSON.stringify(st)}`);
    }
    if (!applied)
        fail('body edit never applied (status never returned to NoChange after arming)');
    console.log('body-edit applied (status NoChange)');

    // 2) global type change → PermanentlyRude (data gate; timing-independent).
    const retype = 'n as string\nm as integer\nn = "x"\ndo\n  n = n + "y"\n  m = 2\nloop\n';
    const rude = await page.evaluate((src) => window.__fadeRunnerHelpers.armReload({ source: src }), retype);
    console.log('retype verdict:', JSON.stringify(rude));
    if (!rude || rude.verdict !== 'PermanentlyRude')
        fail(`global retype expected PermanentlyRude, got ${JSON.stringify(rude)}`);

    console.log('\n── VERDICT ──\nPASS: reload wire path drains+applies body edits and classifies retypes as PermanentlyRude');
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    console.error('recent console:\n' + logs.slice(-25).join('\n'));
    await browser.close();
    process.exit(1);
}
