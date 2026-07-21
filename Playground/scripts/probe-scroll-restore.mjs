// Probe: per-file scroll/cursor is preserved across tab switches.
//
// Open a long file, scroll down, switch to another file, switch back —
// the scroll position should be where we left it, not reset to the top.
//
//   npm run dev
//   node scripts/probe-scroll-restore.mjs
import { chromium } from 'playwright';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const logs = [];
const fail = (m) => { console.error('\n── VERDICT ──\nFAIL: ' + m); console.error(logs.slice(-20).join('\n')); process.exit(1); };

// A long file so there's real scroll range, plus a short second file.
const LONG = Array.from({ length: 200 }, (_, i) => `line${i + 1} = ${i + 1}`).join('\n') + '\n';
const SHORT = 'other = 1\nprint "other"\n';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => logs.push('[PE] ' + e.message));
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 150)}`));

// Grab the main fade editor and read/scroll it.
const editorScrollTop = () => page.evaluate(() => {
    const ed = window.monaco.editor.getEditors().find((e) => e.getModel()?.getLanguageId() === 'fade');
    return ed ? { top: ed.getScrollTop(), uri: ed.getModel().uri.toString() } : null;
});

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async ({ long, short }) => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('scrolltest', { create: true });
        const write = async (n, t) => { const fh = await dir.getFileHandle(n, { create: true }); const w = await fh.createWritable(); await w.write(t); await w.close(); };
        await write('fade.json', JSON.stringify({ $schema: '/fade.schema.json', name: 'scrolltest', type: 'web', commandDlls: [], sources: ['long.fbasic', 'short.fbasic'] }) + '\n');
        await write('long.fbasic', long);
        await write('short.fbasic', short);
        localStorage.setItem('fade.activeProject', 'scrolltest');
    }, { long: LONG, short: SHORT });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers, { timeout: 90_000 });
    await page.waitForSelector('li[data-name="long.fbasic"]', { timeout: 30_000 });

    // Open BOTH files (via the file list) so each has a tab in the strip,
    // then switch between them using the TAB STRIP — the path a user
    // actually uses, and the one that bypassed openFile before the fix.
    const openViaList = async (name) => {
        await page.click(`li[data-name="${name}"]`);
        await page.waitForFunction((n) => window.monaco.editor.getEditors().find((e) => e.getModel()?.getLanguageId() === 'fade')?.getModel()?.uri.toString().endsWith(n), name, { timeout: 15_000 });
    };
    // Click the tab's label span (the onclick lives on the label, not the row).
    const clickTab = async (name) => {
        await page.click(`.tab[data-name="${name}"] span:not(.close):not(.tab-action)`);
        await page.waitForFunction((n) => window.monaco.editor.getEditors().find((e) => e.getModel()?.getLanguageId() === 'fade')?.getModel()?.uri.toString().endsWith(n), name, { timeout: 15_000 });
    };

    await openViaList('short.fbasic');
    await openViaList('long.fbasic');   // long ends up active
    await page.evaluate(() => {
        const ed = window.monaco.editor.getEditors().find((e) => e.getModel()?.getLanguageId() === 'fade');
        ed.revealLine(150);           // scroll line 150 into view
        ed.setPosition({ lineNumber: 150, column: 1 });
    });
    await page.waitForTimeout(300);
    const before = await editorScrollTop();
    console.log('long.fbasic scrollTop after scrolling to line 150:', before?.top);
    if (!before || before.top <= 0) fail(`could not establish a scrolled position (scrollTop=${before?.top})`);

    // Switch to short via TAB, then back to long via TAB.
    await clickTab('short.fbasic');
    await page.waitForTimeout(200);
    const onShort = await editorScrollTop();
    console.log('switched (tab) to short.fbasic, scrollTop:', onShort?.top);

    await clickTab('long.fbasic');
    await page.waitForTimeout(300);
    const after = await editorScrollTop();
    console.log('switched back to long.fbasic, scrollTop:', after?.top);

    const cursor = await page.evaluate(() => {
        const ed = window.monaco.editor.getEditors().find((e) => e.getModel()?.getLanguageId() === 'fade');
        return ed?.getPosition()?.lineNumber ?? null;
    });
    console.log('restored cursor line:', cursor);

    if (after == null || after.top <= 0) fail(`scroll reset to top after switching back (scrollTop=${after?.top}) — view state NOT restored`);
    if (Math.abs(after.top - before.top) > 5) fail(`scroll not restored precisely: was ${before.top}, got ${after.top}`);
    if (cursor !== 150) fail(`cursor line not restored: expected 150, got ${cursor}`);

    console.log('\n── VERDICT ──\nPASS: scroll + cursor restored on switch-back (scrollTop', before.top, '→', after.top + ', cursor line 150)');
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    console.error(logs.slice(-20).join('\n'));
    await browser.close();
    process.exit(1);
}
