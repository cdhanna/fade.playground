// Probe: Auto hot reload (default ON) + the rude → red "Restart" button state.
//
//   • With auto ON, editing the running program auto-applies after the debounce
//     — output switches (AAA→BBB) with NO Hot Load click.
//   • A rude edit (retype a live global) turns the #reload button red "Restart"
//     (class reload-rude, text "Restart") instead of applying.
//
//   npm run dev
//   node scripts/probe-auto-reload.mjs
import { chromium } from 'playwright';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const fail = (msg) => { console.error('\n── VERDICT ──\nFAIL: ' + msg); process.exit(1); };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const logs = [];
page.on('pageerror', (e) => logs.push('[PE] ' + e.message));
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 160)}`));

// Throttled print loop (no `wait` in the web command set).
const V1 = 'n as integer\nn = 0\ndo\n  n = n + 1\n  if n > 100000\n    print "AAA"\n    n = 0\n  endif\nloop\n';
const V2 = V1.replace('AAA', 'BBB');
// Rude: retype the live global n (integer → string). Compiles, but the data
// layout can't migrate live → PermanentlyRude.
const V3 = 'n as string\nn = "hello"\ndo\nloop\n';

const setModel = (src) => page.evaluate((s) => window.monaco.editor.getModel(window.monaco.Uri.file('/workspace/main.fbasic')).setValue(s), src);
const outText = async () => {
    const f = page.frames().find((x) => x.url().includes('/runtime/web/index.html'));
    if (!f) return '';
    try { return await f.evaluate(() => document.getElementById('output')?.innerText ?? ''); } catch { return ''; }
};
const reloadState = () => page.evaluate(() => {
    const b = document.getElementById('reload');
    return { text: (b?.textContent ?? '').trim(), rude: !!b?.classList.contains('reload-rude'), shown: b && getComputedStyle(b).display !== 'none' };
});

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (src) => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('autoreload', { create: true });
        const write = async (n, t) => { const fh = await dir.getFileHandle(n, { create: true }); const w = await fh.createWritable(); await w.write(t); await w.close(); };
        await write('fade.json', JSON.stringify({ $schema: '/fade.schema.json', name: 'autoreload', type: 'web', commandDlls: [], sources: ['main.fbasic'] }) + '\n');
        await write('main.fbasic', src);
        localStorage.setItem('fade.activeProject', 'autoreload');
        localStorage.setItem('fade.launchMode', 'run'); // leave autoHotReload unset → default ON
    }, V1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers?.armReload, { timeout: 90_000 });
    await page.waitForFunction(() => { const b = document.getElementById('launch'); return b && !b.hasAttribute('disabled'); }, { timeout: 30_000 });

    await page.click('#launch');
    await new Promise((r) => setTimeout(r, 2500));
    if (!/AAA/.test(await outText())) fail('V1 never produced AAA — run did not start');
    console.log('running V1 (AAA) ✓');

    // Edit → auto-applies after the debounce, NO click.
    await setModel(V2);
    await new Promise((r) => setTimeout(r, 3000)); // 600ms debounce + apply + a few prints
    const after = (await outText()).split('\n').filter(Boolean);
    if (!after.slice(-3).some((l) => /BBB/.test(l)))
        fail(`auto hot reload did NOT apply — no BBB in output tail ${JSON.stringify(after.slice(-3))}`);
    console.log('auto-applied edit without a click (AAA→BBB) ✓');

    // Rude edit → button turns red "Restart", does not apply.
    await setModel(V3);
    await page.waitForFunction(() => {
        const b = document.getElementById('reload');
        return b && b.classList.contains('reload-rude');
    }, { timeout: 8_000 }).catch(() => fail('rude edit did not turn the reload button red'));
    const st = await reloadState();
    console.log('reload button after rude edit:', JSON.stringify(st));
    if (!st.rude || !/Restart/.test(st.text)) fail(`rude edit should show red "Restart", got ${JSON.stringify(st)}`);
    console.log('rude edit → red Restart ✓');

    console.log('\n── VERDICT ──\nPASS: auto hot reload applies edits without a click; rude edit → red Restart');
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    console.error('recent console:\n' + logs.slice(-25).join('\n'));
    await browser.close();
    process.exit(1);
}
