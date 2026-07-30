// Build the ENTIRE Fade runtime stack from local source — core Fade, the web
// runtime, and the MonoGame layer — and stage it into Playground/public/runtime.
// This is the "all from source" counterpart to package mode (pinned nupkgs).
//
// THE CHAIN (and why each step exists):
//   1. Publish core Fade (+ web) from the dby source into the LocalFade dev feed.
//      WebRuntime.MonoGame references core via a versioned PackageReference
//      ($(FadeVersion)), so a locally-built core must be resolvable from a feed
//      for step 3 to pick it up instead of a published nuget.org version.
//   2. Build the web runtime from dby source (ProjectReference — no feed needed).
//   3. Build the monogame runtime from Fade.MonoGame source, pinning its core
//      PackageReference to the exact version published to LocalFade in step 1.
//
// REQUIRES: the .NET SDK, and the dby + Fade.MonoGame repos checked out as
// siblings (override locations with FADE_REPO / FADE_MONOGAME_REPO). This is a
// heavy build (full dby install.sh + two dotnet publishes); package mode is the
// fast path when you don't need unpublished engine changes.
//
// A unique dev version per run (0.0.0.<seconds>) sidesteps the NuGet restore
// cache, so step 3 always resolves the core just built rather than a stale one.

import { execSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fadeRepoDir, monogameRepoDir, playgroundDir } from './lib/sources.mjs';

const LOG = '[build:all-source]';

for (const [label, dir] of [['dby/FadeBasic', fadeRepoDir], ['Fade.MonoGame', monogameRepoDir]]) {
    if (!existsSync(dir)) {
        console.error(`${LOG} ${label} not found at ${dir}\n       Set FADE_REPO / FADE_MONOGAME_REPO, or clone it as a sibling of this repo.`);
        process.exit(1);
    }
}

// Unique 4-part dev version → SEM_VER 0.0.0.<n>. Uniqueness dodges NuGet's
// restore cache so the monogame build resolves THIS core, not a cached one.
// The 4th (revision) component becomes the assembly version's revision, which
// MUST be <= 65534 (it's a UInt16) or `dotnet pack` fails with CS7034. Unix
// seconds mod 100000000 blows past that, so we mod into the valid range —
// ~65000s (~18h) of uniqueness, more than enough for a dev session. Override
// with FADE_ALL_SOURCE_BUILD (also kept <= 65534).
const rawBuild = process.env.FADE_ALL_SOURCE_BUILD
    ? Number(process.env.FADE_ALL_SOURCE_BUILD)
    : Math.floor(Date.now() / 1000);
const buildNo = String(((rawBuild % 65000) + 65000) % 65000);
const coreSemVer = `0.0.0.${buildNo}`;
const run = (cmd, cwd, env) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });

// `--aot` (or FADE_AOT=1) → publish the web runtime with WASM AOT. Propagated
// to build-runtime.mjs via process.env (run() forwards it). Off by default so
// the full-stack build stays as fast as it can. Only the web LSP runtime reads
// FADE_AOT — the monogame runtime build ignores it.
if (process.argv.includes('--aot')) process.env.FADE_AOT = '1';
if (/^(1|true|yes)$/i.test(process.env.FADE_AOT ?? '')) console.log(`${LOG} AOT enabled for web runtime`);

console.log(`${LOG} building full stack from source; core dev version = ${coreSemVer}`);

// 1. core + web → LocalFade dev feed (clear it first so the version is fresh).
rmSync(resolve(fadeRepoDir, 'obj', 'LocalFade'), { recursive: true, force: true });
run('bash ./setup.sh', fadeRepoDir);
run(`bash ./install.sh 0.0.0 ${buildNo} LocalFade`, fadeRepoDir, { FADE_USE_LOCAL_SOURCE: 'true' });

// 2. web runtime from dby source (ProjectReference — feed not needed here).
run('node scripts/build-runtime.mjs', playgroundDir, { FADE_RUNTIME_MODE: 'source' });

// 3. monogame runtime from Fade.MonoGame source, core pinned to the local build.
run('node scripts/build-monogame-runtime.mjs', playgroundDir, {
    FADE_RUNTIME_MODE: 'source',
    FADE_CORE_VERSION: coreSemVer,
});

console.log(`${LOG} done — staged web + monogame from source into Playground/public/runtime`);
