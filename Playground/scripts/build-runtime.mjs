// Populates Playground/public/runtime/web/ with the FadeBasic.Export.Web runtime
// (so Vite serves the runner same-origin) and stages command DLLs under
// public/runtime/fade-libs/ for the LSP worker.
//
// Two modes (see scripts/lib/sources.mjs):
//   source  — dotnet publish/build the sibling FadeBasic repo. Dev default when
//             it's checked out next door; picks up local Lang.Core edits.
//   package — download the pinned FadeBasic.Export.Web + FadeBasic.Lib.Web
//             nupkgs and extract them. No .NET SDK or source tree required.
//
// Layout under public/runtime/:
//   web/         ← this script's output (Export.Web template)
//   monogame/    ← build-monogame-runtime.mjs's output
//   fade-libs/   ← shared command DLLs (this script writes FadeBasic.Lib.Web.dll)

import { execSync } from 'node:child_process';
import { rm, mkdir, cp, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runtimeRoot, fadeLibsDir, fadeRepoDir, pkgVersions, runtimeMode } from './lib/sources.mjs';
import { fetchNupkgEntries, extractPrefix, extractFile } from './lib/nuget.mjs';
import { writeRuntimeManifest } from './lib/manifest.mjs';

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

console.log(`${LOG} clearing`, targetDir);
await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
// Don't wipe fade-libs — build-monogame-runtime.mjs stages its own DLLs there.
// Just ensure it exists and overwrite our own DLL below.
await mkdir(fadeLibsDir, { recursive: true });

if (mode === 'source') {
    const project = resolve(fadeRepoDir, 'FadeBasic.Export.Web', 'FadeBasic.Export.Web.csproj');
    const publishOut = resolve(fadeRepoDir, 'FadeBasic.Export.Web', 'bin', 'Release', 'net8.0', 'publish', 'wwwroot');
    console.log(`${LOG} dotnet publish`, project);
    execSync(`dotnet publish "${project}" -c Release`, { stdio: 'inherit' });
    if (!existsSync(publishOut)) {
        console.error(`${LOG} expected publish output at ${publishOut} but it does not exist.`);
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
} else {
    const web = await fetchNupkgEntries('FadeBasic.Export.Web', pkgVersions.exportWeb);
    const n = await extractPrefix(web, 'build/wasm/', targetDir);
    console.log(`${LOG} extracted ${n} files from FadeBasic.Export.Web ${pkgVersions.exportWeb} → web/`);

    const lib = await fetchNupkgEntries('FadeBasic.Lib.Web', pkgVersions.libWeb);
    await extractFile(lib, 'lib/net8.0/FadeBasic.Lib.Web.dll', resolve(fadeLibsDir, 'FadeBasic.Lib.Web.dll'));
}
console.log(`${LOG} staged FadeBasic.Lib.Web.dll → public/runtime/fade-libs/`);

await writeRuntimeManifest(targetDir, LOG);
console.log(`${LOG} done.`);
