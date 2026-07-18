// Verifies the ported homepage-style keyword search in the Playground Help:
//   1. Typing a language keyword ("if") surfaces a first-class result
//      badged "Keyword" (not just incidental body-text matches).
//   2. Typing a primitive-type name ("integer") surfaces a "Type" badge.
//   3. The keyword result ranks at the TOP of the dropdown.
//   4. Clicking it switches to the Language tab and lands on the section
//      documenting it (Conditionals lives under Control Statements).

import { chromium } from 'playwright';

const URL = process.env.URL || 'https://localhost:5311/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
const page = await context.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });

const fail = async (msg) => { console.error('\n── VERDICT ──\nFAIL:', msg); await browser.close(); process.exit(1); };

await page.goto(URL, { waitUntil: 'domcontentloaded' });
// Bootstrap (dockview + helpers) only completes once a project is active,
// so seed BEFORE waiting — the welcome screen never sets the flag.
await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const ws = await root.getDirectoryHandle('workspace', { create: true });
    const dir = await ws.getDirectoryHandle('kwsearch', { create: true });
    const write = async (n, t) => { const fh = await dir.getFileHandle(n, { create: true }); const w = await fh.createWritable(); await w.write(t); await w.close(); };
    await write('fade.json', JSON.stringify({ name: 'kwsearch', type: 'web', commandDlls: [], sources: ['main.fbasic'] }) + '\n');
    await write('main.fbasic', 'print "hi"\n');
    localStorage.setItem('fade.activeProject', 'kwsearch');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__fadeBootstrapDone, { timeout: 30_000 });
await page.evaluate(() => window.__fadeDockview?.getPanel?.('help')?.api?.setActive?.());
await new Promise(r => setTimeout(r, 2500));

const rowsFor = async (q) => {
    await page.fill('#help-search', q);
    await new Promise(r => setTimeout(r, 350));
    return page.evaluate(() => Array.from(document.querySelectorAll('#help-search-results .help-search-result')).map(r => ({
        badge: r.querySelector('.help-search-result-badge')?.textContent?.trim(),
        title: r.querySelector('.help-search-result-title')?.textContent?.trim(),
    })));
};

// ── "if" → a Keyword-badged result at the top ─────────────────────────
const ifRows = await rowsFor('if');
console.log('results for "if":'); for (const r of ifRows.slice(0, 5)) console.log('  ', r);
if (ifRows.length === 0) await fail('no results for "if"');
if (ifRows[0].badge !== 'Keyword' || ifRows[0].title !== 'if') {
    await fail(`top result for "if" is not the keyword (got ${JSON.stringify(ifRows[0])})`);
}

// ── "integer" → a Type-badged result ──────────────────────────────────
const intRows = await rowsFor('integer');
console.log('results for "integer":'); for (const r of intRows.slice(0, 4)) console.log('  ', r);
if (!intRows.some(r => r.badge === 'Type' && r.title === 'integer')) {
    await fail('no "Type" badge for "integer"');
}

// ── Click the "if" keyword result → Language tab, Conditionals active ──
await page.fill('#help-search', 'if');
await new Promise(r => setTimeout(r, 350));
await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#help-search-results .help-search-result'));
    const kw = rows.find(r => r.querySelector('.help-search-result-badge')?.textContent === 'Keyword');
    kw?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
});
await new Promise(r => setTimeout(r, 600));
const after = await page.evaluate(() => ({
    activeTab: document.querySelector('.help-tab.active')?.dataset?.tab,
    activeTocText: document.querySelector('#help-toc .help-toc-item.active')?.textContent?.trim(),
    bodyHasConditionals: /conditional/i.test(document.getElementById('help-body')?.textContent || ''),
}));
console.log('after click:', after);
if (after.activeTab !== 'language') await fail('did not switch to Language tab');
if (!after.bodyHasConditionals) await fail('Conditionals content not shown in body');

console.log('\n── VERDICT ──\n✓ PASS: keyword/type search surfaces + navigates to Language docs');
await browser.close();
