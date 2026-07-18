// Probe: reload when the main loop lives INSIDE a function. The apply gate
// requires a top-level clean boundary (methodStack.ptr == 0); inside a function
// the VM sits at ptr >= 1 forever, so the edit may arm but never commit. This
// probe checks whether behavior actually switches (AAA → BBB) in that shape.
import { chromium } from 'playwright';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const logs = [];
page.on('pageerror', (e) => logs.push('[PE] ' + e.message));
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));

const V1 = 'go()\nfunction go()\n  x as integer\n  x = 0\n  do\n    x = x + 1\n    if x > 200000\n      print "AAA"\n      x = 0\n    endif\n  loop\nendfunction\n';
const V2 = V1.replace('AAA', 'BBB');
const outText = async () => {
    const f = page.frames().find((x) => x.url().includes('/runtime/web/index.html'));
    if (!f) return '';
    try { return await f.evaluate(() => document.getElementById('output')?.innerText ?? ''); } catch { return ''; }
};

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (src) => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('reloadinfn', { create: true });
        const write = async (n, t) => {
            const fh = await dir.getFileHandle(n, { create: true });
            const w = await fh.createWritable(); await w.write(t); await w.close();
        };
        await write('fade.json', JSON.stringify({ $schema: '/fade.schema.json', name: 'reloadinfn', type: 'web', commandDlls: [], sources: ['main.fbasic'] }) + '\n');
        await write('main.fbasic', src);
        localStorage.setItem('fade.activeProject', 'reloadinfn');
        localStorage.setItem('fade.launchMode', 'run');
        localStorage.setItem('fade.autoHotReload', 'false');
    }, V1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers?.armReload, { timeout: 90_000 });
    await page.waitForFunction(() => { const b = document.getElementById('launch'); return b && !b.hasAttribute('disabled'); }, { timeout: 20_000 });
    await page.click('#launch');
    await new Promise((r) => setTimeout(r, 2500));
    const before = await outText();
    console.log('V1 running:', /AAA/.test(before), 'tail:', JSON.stringify(before.split('\n').filter(Boolean).slice(-2)));

    // Arm the reload directly and report the verdict + post-status.
    const armed = await page.evaluate((src) => window.__fadeRunnerHelpers.armReload({ source: src }), V2);
    console.log('arm verdict:', JSON.stringify(armed));
    let statuses = [];
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 150));
        const st = await page.evaluate(() => window.__fadeRunnerHelpers.reloadStatus());
        statuses.push(st?.verdict);
        if (st?.verdict === 'NoChange') break;
    }
    console.log('status timeline:', JSON.stringify(statuses));

    await new Promise((r) => setTimeout(r, 3500)); // let the switched loop print enough BBB to clear the seam
    const after = await outText();
    const tail = after.split('\n').filter(Boolean).slice(-4);
    console.log('post-arm output tail:', JSON.stringify(tail));
    // Proven applied when the LATEST line is BBB (the loop is now running new
    // code). Older AAA lines linger in the scrollback — prints are infrequent.
    const last = tail[tail.length - 1] ?? '';
    const switched = /BBB/.test(last);
    console.log('\n── VERDICT ──');
    console.log(switched
        ? 'PASS: reload of an in-function loop APPLIED — behavior switched to BBB.'
        : 'FAIL: still emitting AAA — the in-function loop never committed the armed edit.');
    await browser.close();
    process.exit(switched ? 0 : 1);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    console.error('recent console:\n' + logs.slice(-25).join('\n'));
    await browser.close();
    process.exit(1);
}
