// Probe: hot reload while the DEBUGGER is attached (monogame iframe).
//
// The monogame path can't be verified visually headless (WebGL), so we assert on
// the reload console logs: after a reload commits during a debug session, Game1
// rebinds the debug session (Restart + MarkConnected) and logs
// "[module-reload] debug session rebound" — proving the debugger is kept attached
// through the reload (breakpoints re-verify via REV_REQUEST_RESTART, same as F1).
//
//   npm run dev
//   node scripts/probe-debug-reload-monogame.mjs
import { chromium } from 'playwright';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1200, height: 800 } });
const con = [];
page.on('pageerror', (e) => con.push('[PE] ' + e.message));
page.on('console', (m) => con.push(m.text()));
const hasLog = (re) => con.some((l) => re.test(l));
const fail = (msg) => {
    console.error('\n── VERDICT ──\nFAIL: ' + msg);
    console.error('module-reload logs:\n' + con.filter((l) => /module-reload/.test(l)).join('\n'));
    console.error('last console:\n' + con.slice(-25).join('\n'));
    process.exit(1);
};

const V1 = 'global x as integer\nx = 0\ndo\n  x = x + 1\n  y = x * 2\n  sync\nloop\n';
const V2 = 'global x as integer\nx = 0\ndo\n  x = x + 1\n  y = x * 3\n  sync\nloop\n';

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (src) => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('dbgreloadmg', { create: true });
        const write = async (n, t) => {
            const fh = await dir.getFileHandle(n, { create: true });
            const w = await fh.createWritable(); await w.write(t); await w.close();
        };
        await write('fade.json', JSON.stringify({ $schema: '/fade.schema.json', name: 'dbgreloadmg', type: 'monogame', commandDlls: [], sources: ['main.fbasic'] }) + '\n');
        await write('main.fbasic', src);
        localStorage.setItem('fade.activeProject', 'dbgreloadmg');
        localStorage.setItem('fade.launchMode', 'debug');
        localStorage.setItem('fade.autoHotReload', 'false');
    }, V1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers?.debug?.setGutterBreakpoints && !!window.__fadeRunnerHelpers?.armReload, { timeout: 90_000 });
    await page.waitForFunction(() => { const b = document.getElementById('launch'); return b && !b.hasAttribute('disabled'); }, { timeout: 30_000 });

    // Gutter breakpoint on the increment line, then Debug (boots the iframe).
    await page.evaluate(() => window.__fadeRunnerHelpers.debug.setGutterBreakpoints({ lines: [4] }));
    await page.click('#launch');
    console.log('debug clicked; waiting for the monogame runtime to boot…');
    await new Promise((r) => setTimeout(r, 14_000));

    if (!hasLog(/module-reload] ENABLED/))
        fail('reloader never ENABLED under debug — the debug program has no debug data / reloader disabled');
    console.log('reloader enabled under debug ✓');

    // Edit an unrelated line + arm a reload against the live monogame debug session.
    await page.evaluate((src) => {
        window.monaco.editor.getModel(window.monaco.Uri.file('/workspace/main.fbasic')).setValue(src);
    }, V2);
    await new Promise((r) => setTimeout(r, 400));
    const armed = await page.evaluate((src) => window.__fadeRunnerHelpers.armReload({ source: src }), V2);
    console.log('arm verdict:', armed?.verdict);

    // Continue so the frame loop reaches a safepoint and commits the reload.
    await page.evaluate(() => window.__fadeRunnerHelpers.debug.continue());
    await new Promise((r) => setTimeout(r, 5000));

    if (!hasLog(/module-reload] committed \(web\)/))
        fail('reload never committed under debug');
    console.log('reload committed under debug ✓');
    if (!hasLog(/module-reload] debug session rebound/))
        fail('debug session was NOT rebound after the reload — debugger would be dropped');
    console.log('debug session rebound (attached) ✓');

    console.log('\n── VERDICT ──\nPASS: monogame reload under debug committed and kept the debugger attached');
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    console.error('module-reload logs:\n' + con.filter((l) => /module-reload/.test(l)).join('\n'));
    console.error('last console:\n' + con.slice(-25).join('\n'));
    await browser.close();
    process.exit(1);
}
