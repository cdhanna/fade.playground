import { chromium } from 'playwright';
import { resolve } from 'node:path';

const URL = process.env.URL || 'https://localhost:5311/';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const ws = await root.getDirectoryHandle('workspace', { create: true });
    const dir = await ws.getDirectoryHandle('cgshot', { create: true });
    const write = async (n, t) => { const fh = await dir.getFileHandle(n, { create: true }); const w = await fh.createWritable(); await w.write(t); await w.close(); };
    await write('fade.json', JSON.stringify({ name: 'cgshot', type: 'web', commandDlls: [], sources: ['main.fbasic'] }) + '\n');
    await write('main.fbasic', 'print "hi"\n');
    localStorage.setItem('fade.activeProject', 'cgshot');
});
// Force the upgrade popup.
await page.evaluate(() => localStorage.setItem('fade.playground.lastSeenVersion', '0.1.0'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__fadeBootstrapDone, { timeout: 60_000 });
await page.waitForTimeout(800);

const popup = await page.evaluate(() => {
    const b = document.getElementById('changelog-view-full');
    const entries = Array.from(document.querySelectorAll('#changelog-body .changelog-entry')).map(el => el.dataset.version);
    return { btnVisible: !!b && !b.hidden, entries };
});
console.log('popup:', JSON.stringify(popup));
await page.locator('#changelog-overlay .changelog-modal').screenshot({ path: resolve('changelog-popup.png') });

// Click "View full changelog" → Help panel activates on the Changelog tab.
await page.click('#changelog-view-full');
await page.waitForTimeout(700);

const bodyVersions = () =>
    page.evaluate(() => Array.from(document.querySelectorAll('#help-body .changelog-entry'))
        .map(el => el.dataset.version));

const state = await page.evaluate(() => {
    const helpActive = window.__fadeDockview?.getPanel?.('help')?.api?.isActive ?? null;
    const activeTabBtn = document.querySelector('#help-tabs .help-tab.active')?.dataset.tab ?? null;
    const tocRows = document.querySelectorAll('#help-toc .changelog-toc-item').length;
    const bodyEntries = Array.from(document.querySelectorAll('#help-body .changelog-entry')).map(el => el.dataset.version);
    const active = document.querySelector('#help-toc .changelog-toc-item.active')?.dataset.version ?? null;
    const popupHidden = !!document.getElementById('changelog-overlay')?.hidden;
    return { helpActive, activeTabBtn, tocRows, bodyEntries, active, popupHidden };
});
console.log('after view-full click:', JSON.stringify(state));
await page.locator('#help-pane').screenshot({ path: resolve('changelog-tab.png') });
console.log('wrote changelog-tab.png');

// Click an older version in the TOC → body swaps to just that version.
await page.evaluate(() => {
    const item = Array.from(document.querySelectorAll('#help-toc .changelog-toc-item'))
        .find(el => el.dataset.version === '0.3.0');
    item?.click();
});
await page.waitForTimeout(400);
const afterClick = await page.evaluate(() => ({
    body: Array.from(document.querySelectorAll('#help-body .changelog-entry')).map(el => el.dataset.version),
    active: document.querySelector('#help-toc .changelog-toc-item.active')?.dataset.version ?? null,
}));
console.log('after TOC click 0.3.0:', JSON.stringify(afterClick));

// Sanity: switching to Commands then back to Changelog preserves selection.
await page.click('#help-tabs .help-tab[data-tab="commands"]');
await page.waitForTimeout(300);
await page.click('#help-tabs .help-tab[data-tab="changelog"]');
await page.waitForTimeout(400);
const reentry = await page.evaluate(() => ({
    body: Array.from(document.querySelectorAll('#help-body .changelog-entry')).map(el => el.dataset.version),
    active: document.querySelector('#help-toc .changelog-toc-item.active')?.dataset.version ?? null,
}));
console.log('after Commands→Changelog re-entry:', JSON.stringify(reentry));

await browser.close();
