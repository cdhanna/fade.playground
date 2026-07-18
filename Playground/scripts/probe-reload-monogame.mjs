// Probe: does a hot reload actually COMMIT on a monogame project? The monogame
// path applies via Game1's ModuleReloader at the frame `sync` safepoint. We
// can't reliably read the canvas headless, but the reload path logs to the
// console — [module-reload:web] on arm, [module-reload] committed on apply — so
// we drive a reload and assert the commit log appears.
//
//   npm run dev
//   node scripts/probe-reload-monogame.mjs
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

const V1 = 'global x as integer\nx = 0\ndo\n  x = x + 1\n  sync\nloop\n';
const V2 = 'global x as integer\nx = 0\ndo\n  x = x + 100\n  sync\nloop\n';

const fail = (msg) => {
    console.error('\n── VERDICT ──\nFAIL: ' + msg);
    console.error('module-reload logs:\n' + con.filter((l) => /module-reload/.test(l)).join('\n'));
    console.error('last console:\n' + con.slice(-30).join('\n'));
    process.exit(1);
};

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (src) => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('reloadmg', { create: true });
        const write = async (n, t) => {
            const fh = await dir.getFileHandle(n, { create: true });
            const w = await fh.createWritable(); await w.write(t); await w.close();
        };
        await write('fade.json', JSON.stringify({ $schema: '/fade.schema.json', name: 'reloadmg', type: 'monogame', commandDlls: [], sources: ['main.fbasic'] }) + '\n');
        await write('main.fbasic', src);
        localStorage.setItem('fade.activeProject', 'reloadmg');
        localStorage.setItem('fade.launchMode', 'run');
        localStorage.setItem('fade.autoHotReload', 'false');
    }, V1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers?.armReload, { timeout: 90_000 });
    await page.waitForFunction(() => { const b = document.getElementById('launch'); return b && !b.hasAttribute('disabled'); }, { timeout: 30_000 });

    // Run — boots the ~8MB monogame iframe + WebGL canvas.
    await page.click('#launch');
    console.log('clicked run; waiting for the monogame runtime to boot + tick…');
    await new Promise((r) => setTimeout(r, 12_000));

    // Edit the live model and reload.
    await page.evaluate((src) => {
        const uri = window.monaco.Uri.file('/workspace/main.fbasic');
        const model = window.monaco.editor.getModel(uri);
        if (!model) throw new Error('no model for main.fbasic');
        model.setValue(src);
    }, V2);
    // Give the reload button a moment, then click it (fall back to direct arm).
    await new Promise((r) => setTimeout(r, 800));
    const reloadVisible = await page.evaluate(() => {
        const b = document.getElementById('reload');
        return b && getComputedStyle(b).display !== 'none';
    });
    console.log('reload button visible:', reloadVisible);
    if (reloadVisible) await page.click('#reload');
    else await page.evaluate((src) => window.__fadeRunnerHelpers.armReload({ source: src }), V2);

    // Wait for the frame safepoint to drive the commit.
    await new Promise((r) => setTimeout(r, 4000));

    const armLog = con.filter((l) => /module-reload:web] arm/.test(l)).slice(-1)[0];
    console.log('arm log:', armLog ?? '(none)');
    if (!armLog) fail('no [module-reload:web] arm log — ReloadArm never reached the iframe (canvas failed to boot?)');
    if (/enabled=False/.test(armLog)) fail('reloader DISABLED — the running monogame program has no debug data (Bind rejected it)');

    if (!hasLog(/module-reload] committed \(web\)/))
        fail('armed but NEVER committed — the frame safepoint did not apply the reload');

    console.log('\n── VERDICT ──\nPASS: monogame reload armed and COMMITTED at the frame safepoint');
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    console.error('module-reload logs:\n' + con.filter((l) => /module-reload/.test(l)).join('\n'));
    console.error('last console:\n' + con.slice(-25).join('\n'));
    await browser.close();
    process.exit(1);
}
