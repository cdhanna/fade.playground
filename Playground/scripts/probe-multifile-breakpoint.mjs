// Probe: multi-file breakpoint source mapping (web debugger).
//
// Reproduces the bug the fix targets: with 3 files joined into one program,
// a gutter breakpoint set in the SECOND file must be translated from its
// per-file (Monaco) line into the joined-document line the VM runs. Before
// the fix, syncBreakpointsToWorker sent the raw per-file line, so the VM
// broke somewhere inside the FIRST file instead.
//
//   npm run dev
//   node scripts/probe-multifile-breakpoint.mjs
import { chromium } from 'playwright';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const logs = [];
const dump = () => console.error('recent console:\n' + logs.slice(-30).join('\n'));
const fail = (msg) => { console.error('\n── VERDICT ──\nFAIL: ' + msg); dump(); process.exit(1); };

// File A: 12 lines (joined 0..11). Linear — no loop — so execution flows on
// into file B. `aVar` ends at 10.
const FILE_A = [
    '` file A header',
    'aVar = 1',
    'aVar = aVar + 1',
    'aVar = aVar + 1',
    'aVar = aVar + 1',
    'aVar = aVar + 1',
    'aVar = aVar + 1',
    'aVar = aVar + 1',
    'aVar = aVar + 1',
    'aVar = aVar + 1',
    'aVar = aVar + 1',
    'print "A done"',
].join('\n') + '\n';

// File B: joined 12..14. Breakpoint on local (Monaco 1-based) line 2 =>
// "bVar = 200" => joined 0-based line 13. bp pauses BEFORE that line, so at
// the pause bVar is still 100.
const FILE_B = [
    'bVar = 100',
    'bVar = 200',
    'print "B done"',
].join('\n') + '\n';

const FILE_C = 'print "C done"\n';

const EXPECTED_JOINED_LINE = 13; // startLine(B)=12 + (localLine 2 - 1)
const BUGGY_JOINED_LINE = 1;     // raw local line 2 - 1 (lands inside file A)

const bpState = () => page.evaluate(() => {
    const e = window.__debugLastEvent;
    return { type: e?.type ?? null, id: e?.id ?? null };
});
async function waitForBreakpoint(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 100));
        const s = await bpState();
        if (s.type === 'REV_REQUEST_BREAKPOINT') return s.id;
    }
    return null;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
page.on('pageerror', (e) => logs.push('[PE] ' + e.message));
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async ({ a, b, c }) => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('mfbp', { create: true });
        const write = async (n, t) => {
            const fh = await dir.getFileHandle(n, { create: true });
            const w = await fh.createWritable(); await w.write(t); await w.close();
        };
        await write('fade.json', JSON.stringify({
            $schema: '/fade.schema.json', name: 'mfbp', type: 'web',
            commandDlls: [], sources: ['a.fbasic', 'b.fbasic', 'c.fbasic'],
        }) + '\n');
        await write('a.fbasic', a);
        await write('b.fbasic', b);
        await write('c.fbasic', c);
        localStorage.setItem('fade.activeProject', 'mfbp');
        localStorage.setItem('fade.launchMode', 'debug');
        localStorage.setItem('fade.autoHotReload', 'false');
    }, { a: FILE_A, b: FILE_B, c: FILE_C });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => !!window.__fadeRunnerHelpers?.debug?.setGutterBreakpoints,
        { timeout: 90_000 });
    await page.waitForFunction(
        () => { const btn = document.getElementById('launch'); return btn && !btn.hasAttribute('disabled'); },
        { timeout: 30_000 });

    // Open b.fbasic so it's the active model — setGutterBreakpoints targets
    // the active model, exactly like a user clicking the gutter in file B.
    await page.click('li[data-name="b.fbasic"]', { timeout: 10_000 });
    const activeUri = await page.waitForFunction(() => {
        const ed = window.monaco.editor.getEditors().find((e) => e.getModel()?.getLanguageId() === 'fade');
        const uri = ed?.getModel()?.uri.toString() ?? '';
        return uri.endsWith('b.fbasic') ? uri : false;
    }, { timeout: 15_000 });
    console.log('active file =', await activeUri.jsonValue());

    // Gutter breakpoint on file B, local line 2 ("bVar = 200").
    await page.evaluate(() => window.__fadeRunnerHelpers.debug.setGutterBreakpoints({ lines: [2] }));
    console.log('set gutter breakpoint on b.fbasic line 2');

    // Start the debug session.
    await page.click('#launch');

    const bpId = await waitForBreakpoint(25_000);
    if (bpId == null) fail('breakpoint never hit — debugger did not pause (with the bug it may pause elsewhere or the mapped line never matched)');
    console.log('breakpoint hit ✓ (event id', bpId + ')');

    // Where did we pause? stackFrames reports JOINED 0-based lines.
    const framesJson = await page.evaluate(() => window.__fadeRunnerHelpers.debug.stackFrames());
    let pausedLine = null;
    try {
        const frames = typeof framesJson === 'string' ? JSON.parse(framesJson) : framesJson;
        const top = Array.isArray(frames) ? frames[0] : (frames?.frames?.[0] ?? frames?.stackFrames?.[0]);
        pausedLine = top?.lineNumber ?? top?.line ?? null;
    } catch { /* fall through */ }
    console.log('paused joined line (0-based) =', pausedLine, `(expected ${EXPECTED_JOINED_LINE}, buggy would be ${BUGGY_JOINED_LINE})`);

    // State check: file A ran fully (aVar=10), file B's first line ran
    // (bVar=100) but not the breakpoint line (bVar not yet 200).
    const aVar = await page.evaluate(() => window.__fadeRunnerHelpers.debug.eval({ frameId: 0, expression: 'aVar' }));
    const bVar = await page.evaluate(() => window.__fadeRunnerHelpers.debug.eval({ frameId: 0, expression: 'bVar' }));
    console.log('aVar =', aVar?.value, ' bVar =', bVar?.value);

    if (pausedLine != null && Number(pausedLine) === BUGGY_JOINED_LINE)
        fail(`paused at joined line ${pausedLine} — the buggy raw-per-file line (inside file A), not file B`);
    if (pausedLine != null && Number(pausedLine) !== EXPECTED_JOINED_LINE)
        fail(`paused at joined line ${pausedLine}, expected ${EXPECTED_JOINED_LINE} (file B, line 2)`);
    if (Number(aVar?.value) !== 10)
        fail(`file A did not fully execute before the breakpoint: aVar=${aVar?.value} (expected 10) — paused too early (wrong mapping)`);
    if (Number(bVar?.value) !== 100)
        fail(`breakpoint did not land at file B line 2: bVar=${bVar?.value} (expected 100 — line 1 ran, bp line not yet)`);

    console.log('\n── VERDICT ──\nPASS: breakpoint in the 2nd file mapped to joined line 13 and paused there (aVar=10, bVar=100)');
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    dump();
    await browser.close();
    process.exit(1);
}
