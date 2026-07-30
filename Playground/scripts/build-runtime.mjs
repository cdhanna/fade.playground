// Populates Playground/public/runtime/web/ with the FadeBasic.Export.Web runtime
// (so Vite serves the runner same-origin) and stages command DLLs under
// public/runtime/fade-libs/ for the LSP worker.
//
// Two modes (see scripts/lib/sources.mjs):
//   source  — dotnet publish/build the sibling FadeBasic repo. Dev default when
//             it's checked out next door; picks up local Lang.Core edits.
//   package — delegate to @fadebasic/runtime-assets' stageWebRuntime(), which
//             downloads the pinned nupkgs. Single source of truth for the
//             packaged web runtime, shared with the embeddable components.
//
// Layout under public/runtime/:
//   web/         ← this script's output (Export.Web template)
//   monogame/    ← build-monogame-runtime.mjs's output
//   fade-libs/   ← shared command DLLs (this script writes FadeBasic.Lib.Web.dll)

import { execSync } from 'node:child_process';
import { rm, mkdir, cp, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runtimeRoot, fadeLibsDir, fadeRepoDir, runtimeMode } from './lib/sources.mjs';
import { writeRuntimeManifest } from './lib/manifest.mjs';
import { stageWebRuntime } from '../../packages/runtime-assets/scripts/stage.mjs';

const LOG = '[build:runtime]';
const targetDir = resolve(runtimeRoot, 'web');
const mode = runtimeMode('web');
console.log(`${LOG} mode=${mode}`);

// One-time cleanup of the pre-restructure flat layout: the old layout dropped
// Export.Web files directly into public/runtime/. Everything now lives under
// web/. Wipe leftover top-level files so stale _framework/ / index.html don't
// shadow the new tree; preserve the managed sibling subdirs.
const keepAtRoot = new Set(['web', 'monogame', 'fade-libs']);
if (existsSync(runtimeRoot)) {
    for (const ent of await readdir(runtimeRoot, { withFileTypes: true })) {
        if (keepAtRoot.has(ent.name)) continue;
        const full = resolve(runtimeRoot, ent.name);
        console.log(`${LOG} cleaning stale`, full);
        await rm(full, { recursive: true, force: true });
    }
}

if (mode === 'source') {
    console.log(`${LOG} clearing`, targetDir);
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    // Don't wipe fade-libs — build-monogame-runtime.mjs stages its own DLLs there.
    await mkdir(fadeLibsDir, { recursive: true });

    const project = resolve(fadeRepoDir, 'FadeBasic.Export.Web', 'FadeBasic.Export.Web.csproj');
    const binReleaseDir = resolve(fadeRepoDir, 'FadeBasic.Export.Web', 'bin', 'Release');
    // WASM AOT is opt-in: `--aot` flag or FADE_AOT=1 (build-all-source forwards
    // process.env, so CI just sets FADE_AOT=1 once). Off by default → interpreted
    // build, which is ~fast; regular local dev never pays the AOT cost.
    const aot = process.argv.includes('--aot') || /^(1|true|yes)$/i.test(process.env.FADE_AOT ?? '');
    const aotArg = aot ? ' -p:RunAOTCompilation=true' : '';
    console.log(`${LOG} dotnet publish`, project,
        aot ? '(AOT: slow build, larger bundle, ~5-10x faster runtime)' : '(interpreted: fast build)');
    try {
        execSync(`dotnet publish "${project}" -c Release${aotArg}`, { stdio: 'inherit' });
    } catch (err) {
        if (aot) {
            console.error(`${LOG} AOT publish failed. AOT needs the wasm-tools workload matching the`);
            console.error(`${LOG} runtime's target framework (see the csproj <TargetFramework>), e.g.:`);
            console.error(`${LOG}   dotnet workload install wasm-tools        (net10 target)`);
            console.error(`${LOG}   dotnet workload install wasm-tools-net8   (net8 target)`);
        }
        throw err;
    }
    // Publish output lives at bin/Release/<tfm>/publish/wwwroot. Discover <tfm>
    // rather than hardcoding it, so a TargetFramework bump (net8.0 → net10.0)
    // doesn't silently leave the staged runtime empty.
    let publishOut = null;
    for (const tfm of existsSync(binReleaseDir) ? await readdir(binReleaseDir) : []) {
        const cand = resolve(binReleaseDir, tfm, 'publish', 'wwwroot');
        if (existsSync(cand)) { publishOut = cand; break; }
    }
    if (!publishOut) {
        console.error(`${LOG} no publish output found under ${binReleaseDir}/<tfm>/publish/wwwroot`);
        process.exit(1);
    }
    console.log(`${LOG} copying`, publishOut, '→', targetDir);
    await cp(publishOut, targetDir, { recursive: true });

    // Build the preloaded command lib and stage its real .dll (not the
    // renamed-to-.wasm Blazor variant, which isn't Assembly.Load-able) so the
    // Playground can fetch + dynamically load it at runtime.
    const libProject = resolve(fadeRepoDir, 'FadeBasic.Lib.Web', 'FadeBasic.Lib.Web.csproj');
    const libDll = resolve(fadeRepoDir, 'FadeBasic.Lib.Web', 'bin', 'Release', 'net8.0', 'FadeBasic.Lib.Web.dll');
    console.log(`${LOG} dotnet build FadeBasic.Lib.Web`);
    execSync(`dotnet build "${libProject}" -c Release`, { stdio: 'inherit' });
    if (!existsSync(libDll)) {
        console.error(`${LOG} expected DLL at ${libDll} but it does not exist.`);
        process.exit(1);
    }
    await copyFile(libDll, resolve(fadeLibsDir, 'FadeBasic.Lib.Web.dll'));
    console.log(`${LOG} staged FadeBasic.Lib.Web.dll → public/runtime/fade-libs/`);

    await writeRuntimeManifest(targetDir, LOG);
} else {
    // Package mode delegates to the runtime-assets package — the single owner
    // of the packaged web runtime staging (extract prefixes, lib DLL, manifest).
    await stageWebRuntime({ outDir: runtimeRoot, log: LOG });
}

console.log(`${LOG} done.`);
