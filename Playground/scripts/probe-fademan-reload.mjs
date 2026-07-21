// Repro: hammer Run/reload on the fademan project to trigger the
// intermittent "Asset '...' is not registered with BrowserContentManager.
// Registered: []" that breaks the game after a quick reload.
import { chromium } from 'playwright';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const PROJ = process.env.FADEMAN_DIR;
const logs = [];

// Gather all project files (skip .git and .fade-cache — the runtime rebuilds cache).
function walk(dir, out = []) {
    for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (e === '.git' || e === '.fade-cache') continue;
        if (statSync(p).isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}
const files = walk(PROJ).map((p) => ({
    rel: relative(PROJ, p).split('\\').join('/'),
    b64: readFileSync(p).toString('base64'),
}));
console.log(`loading ${files.length} project files into OPFS…`);

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
page.on('pageerror', (e) => logs.push('[PE] ' + e.message.slice(0, 200)));

const notRegistered = () => logs.filter((l) => /is not registered with BrowserContentManager|not registered\. Registered/i.test(l));

try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (files) => {
        const root = await navigator.storage.getDirectory();
        const ws = await root.getDirectoryHandle('workspace', { create: true });
        const dir = await ws.getDirectoryHandle('fademan', { create: true });
        const b64ToBytes = (b64) => { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a; };
        const mkdirp = async (parts) => { let d = dir; for (const part of parts) d = await d.getDirectoryHandle(part, { create: true }); return d; };
        for (const f of files) {
            const parts = f.rel.split('/'); const name = parts.pop();
            const d = parts.length ? await mkdirp(parts) : dir;
            const fh = await d.getFileHandle(name, { create: true });
            const w = await fh.createWritable(); await w.write(b64ToBytes(f.b64)); await w.close();
        }
        localStorage.setItem('fade.activeProject', 'fademan');
        localStorage.setItem('fade.launchMode', 'run');
        localStorage.setItem('fade.autoHotReload', 'false');
    }, files);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__fadeRunnerHelpers, { timeout: 90_000 });
    await page.waitForSelector('#launch:not([disabled])', { timeout: 60_000 });

    // First clean run to boot the monogame WASM + register assets.
    console.log('initial run (boot WASM + register)…');
    await page.click('#launch');
    await page.waitForTimeout(12_000);
    console.log('after initial run, not-registered errors so far:', notRegistered().length);

    // Now hammer: TRUE overlap. Fire runs via the ⌘R command binding
    // (launchInMode('run') → runOnce, which has no re-entrancy guard) as
    // fast as possible so compileForRun/sync/beginPendingProgram from
    // several invocations interleave — the "reload quickly" race.
    // Guard check: a synchronous burst of launch clicks must collapse to a
    // SINGLE run pipeline. Count "Reset All Systems" (logged once per
    // LoadProgram) triggered by one 6-click burst.
    const countResets = () => logs.filter((l) => /Reset All Systems/i.test(l)).length;
    const before = countResets();
    const guardEngaged = await page.evaluate(() => {
        const b = document.getElementById('launch');
        for (let i = 0; i < 6; i++) b?.click();
        // Right after the synchronous burst, the guard should be holding.
        return typeof window.__fadeLaunchInFlight === 'function'
            ? window.__fadeLaunchInFlight() : 'no-hook';
    });
    await page.waitForTimeout(6000);
    const runsFromBurst = countResets() - before;
    console.log(`guard in-flight right after 6-click burst: ${guardEngaged}`);
    console.log(`run pipelines triggered by the 6-click burst: ${runsFromBurst} (expect 1)`);

    // Also keep hammering to fish for the intermittent error.
    for (let round = 0; round < 10 && notRegistered().length === 0; round++) {
        await page.evaluate(() => document.getElementById('launch')?.click());
        await page.waitForTimeout(700);
    }

    const errs = notRegistered();
    console.log(`\nnot-registered errors: ${errs.length}`);
    for (const e of errs.slice(0, 6)) console.log('  ', e);

    if (errs.length > 0) {
        console.log('\n── VERDICT ──\nREPRODUCED: quick re-runs produced empty-registry asset errors');
    } else {
        console.log('\nrecent console tail:');
        console.log(logs.slice(-15).join('\n'));
        console.log('\n── VERDICT ──\nNOT reproduced this run (intermittent — try more rounds)');
    }
    await browser.close();
    process.exit(0);
} catch (e) {
    console.error('probe error:', e?.message ?? e);
    console.error(logs.slice(-25).join('\n'));
    await browser.close();
    process.exit(1);
}
