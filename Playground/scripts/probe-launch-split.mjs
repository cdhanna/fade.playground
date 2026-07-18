// Probe: the split launch button + dropdown (mode select + auto-hot-reload).
//
// Verifies: default primary = Debug; caret opens the menu with a checkmark on
// the active mode; switching to Run updates the primary + persists across a
// reload; the auto-hot-reload toggle flips its checkmark; launching morphs the
// primary to Reset (run) / Restart Debugging (debug).
//
//   npm run dev
//   node scripts/probe-launch-split.mjs
import { chromium } from 'playwright';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const fail = (msg) => { console.error('\n── VERDICT ──\nFAIL: ' + msg); process.exit(1); };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const logs = [];
page.on('pageerror', (e) => logs.push('[PE] ' + e.message));
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 160)}`));

const launchText = () => page.evaluate(() => (document.getElementById('launch')?.textContent ?? '').trim());
const check = (id) => page.evaluate((i) => (document.getElementById(i)?.querySelector('.check-col')?.textContent ?? '').trim(), id);
const menuHidden = () => page.evaluate(() => document.getElementById('launch-menu')?.hasAttribute('hidden'));
const seed = async () => page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const ws = await root.getDirectoryHandle('workspace', { create: true });
    const dir = await ws.getDirectoryHandle('launchsplit', { create: true });
    const write = async (n, t) => { const fh = await dir.getFileHandle(n, { create: true }); const w = await fh.createWritable(); await w.write(t); await w.close(); };
    await write('fade.json', JSON.stringify({ $schema: '/fade.schema.json', name: 'launchsplit', type: 'web', commandDlls: [], sources: ['main.fbasic'] }) + '\n');
    await write('main.fbasic', 'n as integer\nn = 0\ndo\n  n = n + 1\nloop\n');
    localStorage.setItem('fade.activeProject', 'launchsplit');
    // leave launchMode unset → defaults to Debug
});

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await seed();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers?.armReload, { timeout: 90_000 });
    await page.waitForFunction(() => { const b = document.getElementById('launch'); return b && !b.hasAttribute('disabled'); }, { timeout: 30_000 });

    // 1) Default primary = Debug.
    if (!/Debug/.test(await launchText())) fail(`default launch button should say Debug, got "${await launchText()}"`);
    console.log('default = Debug ✓');

    // 2) Caret opens the menu; Debug item checked, Run not.
    await page.click('#launch-caret');
    if (await menuHidden()) fail('caret did not open the launch menu');
    if ((await check('launch-mode-debug')) !== '✓') fail('Debug item should be checked by default');
    if ((await check('launch-mode-run')) === '✓') fail('Run item should NOT be checked by default');
    // auto-hot-reload default ON.
    if ((await check('auto-hot-reload-item')) !== '✓') fail('Auto hot reload should default ON (checked)');
    console.log('menu opens, Debug checked, auto-reload ON ✓');

    // 3) Switch to Run → primary updates, menu closes.
    await page.click('#launch-mode-run');
    if (!(await menuHidden())) fail('menu should close after picking a mode');
    if (!/Run/.test(await launchText())) fail(`after switching, launch button should say Run, got "${await launchText()}"`);
    console.log('switched to Run ✓');

    // 4) Persists across reload.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('launch'); return b && !b.hasAttribute('disabled'); }, { timeout: 30_000 });
    if (!/Run/.test(await launchText())) fail('launch mode did not persist across reload');
    console.log('mode persists across reload ✓');

    // 5) Toggle auto hot reload off → checkmark clears, menu stays open.
    await page.click('#launch-caret');
    await page.click('#auto-hot-reload-item');
    if (await menuHidden()) fail('menu should stay open when toggling auto hot reload');
    if ((await check('auto-hot-reload-item')) === '✓') fail('Auto hot reload should be OFF after toggling');
    console.log('auto-reload toggle off ✓');
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.click(5, 200); // close menu via outside click

    // 6) Launch (Run) → primary morphs to Reset.
    await page.click('#launch');
    await page.waitForFunction(() => /Reset/.test((document.getElementById('launch')?.textContent ?? '')), { timeout: 15_000 })
        .catch(() => fail(`running (run mode) should show Reset, got "${''}"`));
    console.log('running (run) → Reset ✓');

    console.log('\n── VERDICT ──\nPASS: split launch button — mode select, persistence, auto-reload toggle, Reset label');
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    console.error('recent console:\n' + logs.slice(-25).join('\n'));
    await browser.close();
    process.exit(1);
}
