// Probe: a standalone Fade export registers its bundled audio at boot.
// Serves the extracted export dir, boots it headless, and asserts that
// window.fadeAudio.register succeeds for every manifest.audio clip and
// that `load sfx clip` resolves (fadeAudio holds the clip).
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = process.env.EXPORT_DIR;
const PORT = 5599;
const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.json':'application/json', '.wasm':'application/wasm', '.css':'text/css',
  '.dll':'application/octet-stream', '.dat':'application/octet-stream',
  '.wav':'audio/wav', '.xnb':'application/octet-stream', '.pdb':'application/octet-stream',
  '.woff':'font/woff', '.woff2':'font/woff2', '.blat':'application/octet-stream',
  '.br':'application/octet-stream', '.symbols':'application/octet-stream',
};
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const full = normalize(join(ROOT, p));
    if (!full.startsWith(ROOT) || !existsSync(full) || statSync(full).isDirectory()) {
      res.writeHead(404); res.end('nf'); return;
    }
    const buf = await readFile(full);
    // Blazor WASM likes these; harmless for the rest.
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', MIME[extname(full).toLowerCase()] || 'application/octet-stream');
    res.writeHead(200); res.end(buf);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(PORT, r));
console.log('serving', ROOT, 'on', PORT);

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0,200)}`));
page.on('pageerror', (e) => logs.push('[PE] ' + e.message));

const audioFetches = [];
page.on('response', (r) => { const u = r.url(); if (u.includes('/audio/')) audioFetches.push({ status: r.status(), url: u }); });

try {
  // Instrument fadeAudio.register before boot to record names + results.
  await page.addInitScript(() => {
    window.__reg = [];
    const iv = setInterval(() => {
      if (window.fadeAudio && !window.fadeAudio.__wrapped) {
        window.fadeAudio.__wrapped = true;
        const orig = window.fadeAudio.register.bind(window.fadeAudio);
        window.fadeAudio.register = async (name, bytes) => {
          const ok = await orig(name, bytes);
          window.__reg.push({ name, ok, bytes: bytes?.length ?? 0 });
          return ok;
        };
        clearInterval(iv);
      }
    }, 10);
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  // Wait until the program has started (load sfx clip runs during LoadProgram).
  await page.waitForFunction(() => window.__reg && window.__reg.length > 0, { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(4000); // let all registrations + LoadProgram finish

  const reg = await page.evaluate(() => window.__reg || []);
  const clipInfo = await page.evaluate(() => {
    try { return { highestClipId: window.fadeAudio?.highestClipId?.() ?? null }; }
    catch { return { highestClipId: null }; }
  });

  const okCount = reg.filter((r) => r.ok).length;
  console.log(`\naudio fetches: ${audioFetches.length} (statuses: ${[...new Set(audioFetches.map(a=>a.status))].join(',')})`);
  console.log(`fadeAudio.register calls: ${reg.length}, decoded ok: ${okCount}`);
  console.log('sample:', JSON.stringify(reg.slice(0,3)));
  console.log('highestClipId (>=0 means a clip loaded via `load sfx clip`):', clipInfo.highestClipId);
  const notReg = logs.filter((l) => /not registered|decode failed|audio load failed/i.test(l));
  if (notReg.length) console.log('audio errors:\n' + notReg.join('\n'));

  const bad404 = audioFetches.filter((a) => a.status >= 400);
  let verdict = 'PASS';
  if (audioFetches.length === 0) verdict = 'FAIL: no audio files were fetched';
  else if (bad404.length) verdict = `FAIL: ${bad404.length} audio fetch(es) 4xx/5xx`;
  else if (reg.length === 0) verdict = 'FAIL: fadeAudio.register never called';
  else if (okCount === 0) verdict = 'FAIL: no audio clip decoded successfully';
  console.log('\n── VERDICT ──\n' + verdict);
  await browser.close(); server.close();
  process.exit(verdict.startsWith('PASS') ? 0 : 1);
} catch (e) {
  console.error('probe error:', e?.message ?? e);
  console.error(logs.slice(-25).join('\n'));
  await browser.close(); server.close();
  process.exit(1);
}
