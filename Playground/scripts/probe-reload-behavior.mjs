// Probe: does a hot reload actually CHANGE OBSERVABLE BEHAVIOR (not just flip
// the wire verdict)? probe-reload.mjs proved the status flips to NoChange;
// this proves the running program's print output switches to the new code.
//
//   npm run dev
//   node scripts/probe-reload-behavior.mjs
import { chromium } from 'playwright';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const fail = (msg) => { console.error('\n── VERDICT ──\nFAIL: ' + msg); process.exit(1); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const logs = [];
page.on('pageerror', (e) => logs.push('[PE] ' + e.message));
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));

// Loop that prints a token every N iterations (throttled with a counter — the
// web standard command set has no `wait`). The reload edits the print literal;
// after it applies, the running loop must start emitting the new token.
const V1 = 'x as integer\nx = 0\ndo\n  x = x + 1\n  if x > 200000\n    print "AAA"\n    x = 0\n  endif\nloop\n';
const V2 = 'x as integer\nx = 0\ndo\n  x = x + 1\n  if x > 200000\n    print "BBB"\n    x = 0\n  endif\nloop\n';
// Web-preview `print` output renders inside the preview iframe's #output
// (NOT the Playground's Output panel — see CLAUDE.md). Read from that frame.
const outText = async () => {
    const frame = page.frames().find((f) => f.url().includes('/runtime/web/index.html'));
    if (!frame) return '';
    try { return await frame.evaluate(() => document.getElementById('output')?.innerText ?? ''); }
    catch { return ''; }
};

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (src) => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('reloadbehav', { create: true });
        const write = async (n, t) => {
            const fh = await dir.getFileHandle(n, { create: true });
            const w = await fh.createWritable(); await w.write(t); await w.close();
        };
        await write('fade.json', JSON.stringify({
            $schema: '/fade.schema.json', name: 'reloadbehav', type: 'web',
            commandDlls: [], sources: ['main.fbasic'],
        }) + '\n');
        await write('main.fbasic', src);
        localStorage.setItem('fade.activeProject', 'reloadbehav');
        localStorage.setItem('fade.launchMode', 'run');
        localStorage.setItem('fade.autoHotReload', 'false');
    }, V1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers?.armReload, { timeout: 90_000 });

    await page.waitForFunction(
        () => { const b = document.getElementById('launch'); return b && !b.hasAttribute('disabled'); },
        { timeout: 20_000 },
    ).catch(() => fail('#launch never enabled — project has compile errors (check the program)'));
    await page.click('#launch');
    await new Promise((r) => setTimeout(r, 2500)); // let V1 print several times
    const before = await outText();
    console.log('V1 output tail:', JSON.stringify(before.split('\n').filter(Boolean).slice(-3)));
    if (!/AAA/.test(before)) fail('V1 never produced "AAA" output — run did not start');

    // Edit the live model to V2 and reload.
    await page.evaluate((src) => {
        const uri = window.monaco.Uri.file('/workspace/main.fbasic');
        const model = window.monaco.editor.getModel(uri);
        if (!model) throw new Error('no model for main.fbasic');
        model.setValue(src);
    }, V2);
    await page.waitForFunction(
        () => getComputedStyle(document.getElementById('reload')).display !== 'none',
        { timeout: 10_000 },
    ).catch(() => fail('Reload button never revealed'));

    const markLen = (await outText()).length; // everything after here is post-reload
    await page.click('#reload');
    await new Promise((r) => setTimeout(r, 3000)); // let the reloaded loop print several times

    const after = await outText();
    const postReload = after.slice(markLen);
    const tail = postReload.split('\n').filter(Boolean);
    console.log('post-reload output tail:', JSON.stringify(tail.slice(-4)));

    if (!/BBB/.test(postReload))
        fail('reload applied per the verdict, but output NEVER switched to "BBB" — the new code is not running');
    // Also assert V1 stopped emitting after the switch: the LAST few lines
    // should be BBB, not AAA (allowing a couple in-flight AAA right at the seam).
    const lastFour = tail.slice(-4);
    if (lastFour.some((l) => /AAA/.test(l)))
        fail(`"AAA" still printing after reload — old code still live. tail=${JSON.stringify(lastFour)}`);

    console.log('\n── VERDICT ──\nPASS: reload changed observable behavior (output switched AAA → BBB, old code stopped)');
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    console.error('recent console:\n' + logs.slice(-30).join('\n'));
    await browser.close();
    process.exit(1);
}
