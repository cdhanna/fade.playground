// Populates Playground/public/runtime/monogame/ with the WebRuntime.MonoGame
// (KNI BlazorGL) runtime, and stages the MonoGame command DLLs under
// public/runtime/fade-libs/ for the LSP worker (hover/completion/parse — the
// iframe's Game1 owns actual execution).
//
// Two modes (see scripts/lib/sources.mjs):
//   source  — dotnet publish the sibling Fade.MonoGame repo (WebRuntime.MonoGame,
//             FadeMonoGamePlatform=Web). Dev default when it's checked out.
//   package — download the pinned FadeBasic.Export.MonoGame nupkg + the
//             FadeBasic.MonoGame.{Contracts,Game,Lib} lib DLLs and extract them.
//             No .NET SDK / source tree / Wine shader bake required.
//
// The LSP needs real .dll files (not the renamed-to-.wasm Blazor variants — real
// WASM modules in .NET 8, not Assembly.Load-able). KNI + MonoGame.Framework are
// NOT staged: huge, and never needed for metadata enumeration.

import { execSync } from 'node:child_process';
import { rm, mkdir, cp, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { playgroundDir, runtimeRoot, fadeLibsDir, monogameRepoDir, pkgVersions, runtimeMode } from './lib/sources.mjs';
import { fetchNupkgEntries, extractPrefix, extractFile } from './lib/nuget.mjs';
import { writeRuntimeManifest } from './lib/manifest.mjs';

const LOG = '[build:monogame-runtime]';
const targetDir = resolve(runtimeRoot, 'monogame');
const mode = runtimeMode('monogame');
console.log(`${LOG} mode=${mode}`);

// One-time cleanup of the pre-restructure location. Safe to drop once everyone's
// rebuilt past the rename.
const legacyTargetDir = resolve(playgroundDir, 'public', 'monogame-runtime');
if (existsSync(legacyTargetDir)) {
    console.log(`${LOG} removing legacy`, legacyTargetDir);
    await rm(legacyTargetDir, { recursive: true, force: true });
}

console.log(`${LOG} clearing`, targetDir);
await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await mkdir(fadeLibsDir, { recursive: true });

// The three MonoGame command DLLs the LSP loads. Package id → assembly file.
// (Fade.MonoGame.Lib's csproj ProjectReferences Game, which pulls Contracts;
// preloading all three is cheap insurance for Activator.CreateInstance.)
const monoLibs = [
    { pkg: 'FadeBasic.MonoGame.Contracts', dll: 'Fade.MonoGame.Contracts.dll' },
    { pkg: 'FadeBasic.MonoGame.Game', dll: 'Fade.MonoGame.Game.dll' },
    { pkg: 'FadeBasic.MonoGame.Lib', dll: 'Fade.MonoGame.Lib.dll' },
];

if (mode === 'source') {
    const project = resolve(monogameRepoDir, 'WebRuntime.MonoGame', 'WebRuntime.MonoGame.csproj');
    const publishOut = resolve(monogameRepoDir, 'WebRuntime.MonoGame', 'bin', 'Release', 'net8.0', 'publish', 'wwwroot');
    console.log(`${LOG} dotnet publish`, project);
    execSync(`dotnet publish "${project}" -c Release /p:FadeMonoGamePlatform=Web`, { stdio: 'inherit' });
    if (!existsSync(publishOut)) {
        console.error(`${LOG} expected publish output at ${publishOut} but it does not exist.`);
        process.exit(1);
    }
    console.log(`${LOG} copying`, publishOut, '→', targetDir);
    await cp(publishOut, targetDir, { recursive: true });

    const libsBin = resolve(monogameRepoDir, 'WebRuntime.MonoGame', 'bin', 'Release', 'net8.0');
    for (const { dll } of monoLibs) {
        const src = resolve(libsBin, dll);
        if (!existsSync(src)) {
            console.error(`${LOG} expected ${src} but it does not exist.`);
            process.exit(1);
        }
        await copyFile(src, resolve(fadeLibsDir, dll));
        console.log(`${LOG} staged ${dll} → public/runtime/fade-libs/`);
    }
} else {
    const mgRuntime = await fetchNupkgEntries('FadeBasic.Export.MonoGame', pkgVersions.exportMonoGame);
    const n = await extractPrefix(mgRuntime, 'build/wasm/', targetDir);
    console.log(`${LOG} extracted ${n} files from FadeBasic.Export.MonoGame ${pkgVersions.exportMonoGame} → monogame/`);

    for (const { pkg, dll } of monoLibs) {
        const entries = await fetchNupkgEntries(pkg, pkgVersions.monogame);
        await extractFile(entries, `lib/net8.0/${dll}`, resolve(fadeLibsDir, dll));
        console.log(`${LOG} staged ${dll} → public/runtime/fade-libs/`);
    }
}

await writeRuntimeManifest(targetDir, LOG);
console.log(`${LOG} done.`);
