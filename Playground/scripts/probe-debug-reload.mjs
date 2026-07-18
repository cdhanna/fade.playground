// Probe: hot reload while the DEBUGGER is attached (web worker).
//
// Drives the REAL debug UI (so debugSessionActive + gutter breakpoints match a
// user session): set a gutter breakpoint, Debug, hit it, arm a reload editing an
// UNRELATED line, continue → the reload applies to the live VM, the session
// rebinds (REV_REQUEST_RESTART → syncBreakpointsToWorker re-sends breakpoints),
// and the breakpoint hits AGAIN — with the global preserved across the reload.
//
//   npm run dev
//   node scripts/probe-debug-reload.mjs
import { chromium } from 'playwright';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const logs = [];
const dump = () => console.error('recent console:\n' + logs.slice(-30).join('\n'));
const fail = (msg) => { console.error('\n── VERDICT ──\nFAIL: ' + msg); dump(); process.exit(1); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
page.on('pageerror', (e) => logs.push('[PE] ' + e.message));
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));

// Breakpoint on line 4 (1-based) = "x = x + 1". The reload edits line 5
// ("print ...") — a different statement — so it applies at the bp boundary.
const V1 = 'x as integer\nx = 0\ndo\n  x = x + 1\n  print "AAA"\nloop\n';
const V2 = 'x as integer\nx = 0\ndo\n  x = x + 1\n  print "BBB"\nloop\n';

const bpState = () => page.evaluate(() => {
    const e = window.__debugLastEvent;
    return { type: e?.type ?? null, id: e?.id ?? null };
});
async function waitForNewBreakpoint(sinceId, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 100));
        const s = await bpState();
        if (s.type === 'REV_REQUEST_BREAKPOINT' && s.id !== sinceId) return s.id;
    }
    return null;
}

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (src) => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('dbgreload', { create: true });
        const write = async (n, t) => {
            const fh = await dir.getFileHandle(n, { create: true });
            const w = await fh.createWritable(); await w.write(t); await w.close();
        };
        await write('fade.json', JSON.stringify({ $schema: '/fade.schema.json', name: 'dbgreload', type: 'web', commandDlls: [], sources: ['main.fbasic'] }) + '\n');
        await write('main.fbasic', src);
        localStorage.setItem('fade.activeProject', 'dbgreload');
        localStorage.setItem('fade.launchMode', 'debug');
        localStorage.setItem('fade.autoHotReload', 'false');
    }, V1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers?.debug?.setGutterBreakpoints && !!window.__fadeRunnerHelpers?.armReload, { timeout: 90_000 });
    await page.waitForFunction(() => { const b = document.getElementById('launch'); return b && !b.hasAttribute('disabled'); }, { timeout: 30_000 });

    // Gutter breakpoint on the increment line, then Debug (the real path:
    // beginDebugSession sets debugSessionActive + syncs breakpoints + continues).
    await page.evaluate(() => window.__fadeRunnerHelpers.debug.setGutterBreakpoints({ lines: [4] }));
    let lastBpId = (await bpState()).id;
    await page.click('#launch');

    const bp1 = await waitForNewBreakpoint(lastBpId, 20_000);
    if (bp1 == null) fail('breakpoint never hit before reload');
    console.log('breakpoint hit #1 ✓');
    const xBefore = await page.evaluate(() => window.__fadeRunnerHelpers.debug.eval({ frameId: 0, expression: 'x' }));
    console.log('x at bp1:', xBefore?.value);

    // Edit + arm a reload against the live debug session WHILE PAUSED — do NOT
    // continue. The reload must apply at the paused boundary and STAY paused.
    await page.evaluate((src) => {
        window.monaco.editor.getModel(window.monaco.Uri.file('/workspace/main.fbasic')).setValue(src);
    }, V2);
    const armed = await page.evaluate((src) => window.__fadeRunnerHelpers.armReload({ source: src }), V2);
    console.log('arm verdict:', armed?.verdict);
    if (!armed || (armed.verdict !== 'ApplicableNow' && armed.verdict !== 'PendingTransient'))
        fail(`reload arm expected ApplicableNow/PendingTransient, got ${JSON.stringify(armed)}`);

    // Reload commits WHILE PAUSED (no continue). Poll for it.
    let applied = false;
    for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const st = await page.evaluate(() => window.__fadeRunnerHelpers.reloadStatus());
        if (st?.verdict === 'NoChange') { applied = true; break; }
    }
    if (!applied) fail('reload never committed while paused (status stayed pending)');
    console.log('reload committed while paused ✓');

    // STAY PAUSED: the program must NOT have resumed. No new breakpoint event
    // should have fired (a resume would run the loop and re-hit), and an eval
    // must still work (only possible while paused) with x unchanged.
    await new Promise((r) => setTimeout(r, 800)); // give a resume (if buggy) time to run + re-hit
    const afterState = await bpState();
    if (afterState.type === 'REV_REQUEST_BREAKPOINT' && afterState.id !== bp1)
        fail('program RESUMED after reload while paused — a new breakpoint hit fired (should have stayed paused)');
    const xPaused = await page.evaluate(() => window.__fadeRunnerHelpers.debug.eval({ frameId: 0, expression: 'x' }));
    if (xPaused?.value == null) fail('not paused after reload — eval returned nothing (program resumed)');
    console.log('stayed paused after reload ✓ (x still', xPaused.value + ')');
    if (Number(xPaused.value) !== Number(xBefore?.value))
        fail(`state advanced while "paused": x ${xBefore?.value} → ${xPaused.value} (should not have executed)`);

    // Now continue — the breakpoint must re-hit (debugger fully intact post-reload).
    lastBpId = bp1;
    await page.evaluate(() => window.__fadeRunnerHelpers.debug.continue());
    const bp2 = await waitForNewBreakpoint(lastBpId, 20_000);
    if (bp2 == null) fail('breakpoint did NOT re-hit after continue — debugger dropped or breakpoints lost');
    console.log('breakpoint hit #2 after continue ✓');

    const xAfter = await page.evaluate(() => window.__fadeRunnerHelpers.debug.eval({ frameId: 0, expression: 'x' }));
    console.log('x at bp2:', xAfter?.value);
    // State preserved: x kept climbing (never reset to 0 by a restart).
    if (Number(xAfter?.value) < Number(xBefore?.value))
        fail(`state not preserved: x went backwards ${xBefore?.value} → ${xAfter?.value}`);

    console.log('\n── VERDICT ──\nPASS: debugger stayed attached through hot reload — breakpoint re-hit, state preserved');
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    dump();
    await browser.close();
    process.exit(1);
}
