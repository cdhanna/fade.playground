// Measure MonoGame per-tick time across the menu→game transition to see
// whether the ~1s lag is jiterpreter warmup (tick times start high and
// STEP DOWN) vs a one-time spike (GC / first-draw).
import { chromium } from 'playwright';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const BASE = process.env.FADE_PROBE_URL ?? 'https://localhost:5311/';
const PROJ = process.env.FADEMAN_DIR;
const logs = [];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === '.git' || e === '.fade-cache') continue;
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(PROJ).map((p) => ({ rel: relative(PROJ, p).split('\\').join('/'), b64: readFileSync(p).toString('base64') }));

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => logs.push('[PE] ' + e.message.slice(0, 200)));

// Install a per-tick timer in EVERY frame (the iframe is where TickDotNet runs).
await page.addInitScript(() => {
  window.__ticks = [];
  window.__mark = (label) => window.__ticks.push({ mark: label });
  const iv = setInterval(() => {
    const inst = window.theInstance;
    if (inst && inst.invokeMethod && !inst.__tw) {
      inst.__tw = true;
      const orig = inst.invokeMethod.bind(inst);
      inst.invokeMethod = function (method, ...args) {
        if (method === 'TickDotNet') {
          const t0 = performance.now();
          const r = orig(method, ...args);
          window.__ticks.push({ ms: +(performance.now() - t0).toFixed(2) });
          return r;
        }
        return orig(method, ...args);
      };
      clearInterval(iv);
    }
  }, 15);
});

const mgFrame = () => page.frames().find((f) => /mg-preview|runtime\/monogame|preview=1/.test(f.url()) || f.name() === 'mg-preview-frame')
  || page.frames().find((f) => f !== page.mainFrame());

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    const ws = await root.getDirectoryHandle('workspace', { create: true });
    const dir = await ws.getDirectoryHandle('fademan', { create: true });
    const b64 = (s) => { const b = atob(s); const a = new Uint8Array(b.length); for (let i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a; };
    const mkdirp = async (parts) => { let d = dir; for (const p of parts) d = await d.getDirectoryHandle(p, { create: true }); return d; };
    for (const f of files) { const parts = f.rel.split('/'); const name = parts.pop(); const d = parts.length ? await mkdirp(parts) : dir; const fh = await d.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(b64(f.b64)); await w.close(); }
    localStorage.setItem('fade.activeProject', 'fademan');
    localStorage.setItem('fade.launchMode', 'run');
    localStorage.setItem('fade.autoHotReload', 'false');
  }, files);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__fadeRunnerHelpers, { timeout: 90_000 });
  await page.waitForSelector('#launch:not([disabled])', { timeout: 60_000 });

  console.log('running (boot WASM → menu)…');
  await page.click('#launch');
  // Wait for the game canvas + menu to be up and ticking.
  await page.waitForFunction(() => {
    const f = [...document.querySelectorAll('iframe')].map(i => i.contentWindow).find(w => { try { return w && Array.isArray(w.__ticks) && w.__ticks.length > 30; } catch { return false; } });
    return !!f;
  }, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2000); // let the menu tick a bit (baseline)

  const frame = mgFrame();
  if (!frame) throw new Error('monogame iframe not found');

  // Focus the canvas and press Space to exit the menu.
  await frame.evaluate(() => window.__mark && window.__mark('PRE_SPACE'));
  const canvas = frame.locator('#theCanvas');
  await canvas.click({ position: { x: 200, y: 200 } }).catch(() => {});
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await page.keyboard.up('Space');
  await frame.evaluate(() => window.__mark && window.__mark('SPACE_RELEASED'));

  // Record ~4s of main-game ticks (COLD run).
  await page.waitForTimeout(4000);

  // --- Experiment: the VM is now warm. Re-run and measure the SECOND
  // world-build. If warming helps, the second big frame should be far
  // smaller than the first. This needs no runtime change.
  console.log('re-running (VM now warm)…');
  await frame.evaluate(() => window.__mark && window.__mark('RERUN'));
  await page.click('#launch');                 // Reset → program restarts at the menu
  await page.waitForTimeout(2500);             // let it reach the menu again
  await frame.evaluate(() => window.__mark && window.__mark('PRE_SPACE2'));
  await frame.locator('#theCanvas').click({ position: { x: 200, y: 200 } }).catch(() => {});
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await page.keyboard.up('Space');
  await page.waitForTimeout(3000);

  const ticks = await frame.evaluate(() => window.__ticks);
  await browser.close();

  const num = (t) => typeof t.ms === 'number';
  // Biggest single frame in the ~1.5s window after a given mark = the world-build.
  const worldBuild = (markLabel) => {
    const i = ticks.findIndex((t) => t.mark === markLabel);
    if (i < 0) return null;
    const after = ticks.slice(i + 1).filter(num).map((t) => t.ms).slice(0, 120);
    const spike = Math.max(...after);
    const spikeIdx = after.indexOf(spike);
    const tail = after.slice(spikeIdx, spikeIdx + 8); // spike + next 7 frames
    return { spike: +spike.toFixed(1), tail: tail.map((x) => +x.toFixed(1)) };
  };

  const cold = worldBuild('PRE_SPACE');
  const warm = worldBuild('PRE_SPACE2');
  console.log('\n=== COLD first run ===');
  console.log('  world-build spike:', cold?.spike, 'ms   spike+tail:', JSON.stringify(cold?.tail));
  console.log('\n=== WARM re-run (same code, VM already warmed) ===');
  console.log('  world-build spike:', warm?.spike, 'ms   spike+tail:', JSON.stringify(warm?.tail));
  if (cold && warm) {
    console.log(`\nworld-build spike: ${cold.spike}ms → ${warm.spike}ms  (${(cold.spike/warm.spike).toFixed(1)}× faster warm)`);
  }
  process.exit(0);
} catch (e) {
  console.error('probe error:', e?.message ?? e);
  console.error(logs.slice(-25).join('\n'));
  await browser.close();
  process.exit(1);
}
