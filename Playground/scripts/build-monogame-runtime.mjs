// Populates Playground/public/runtime/monogame/ with the WebRuntime.MonoGame
// (KNI BlazorGL) runtime, and stages the MonoGame command DLLs under
// public/runtime/fade-libs/ for the LSP worker (hover/completion/parse — the
// iframe's Game1 owns actual execution).
//
// Two modes (see scripts/lib/sources.mjs):
//   source  — dotnet publish the sibling Fade.MonoGame repo (WebRuntime.MonoGame,
//             FadeMonoGamePlatform=Web). Dev default when it's checked out.
//             WebRuntime.MonoGame PackageReferences core Fade at $(FadeVersion);
//             set FADE_CORE_VERSION to pin it to a locally-built core (see
//             build-all-source.mjs) — otherwise the csproj default is used.
//   package — delegate to @fadebasic/runtime-assets' stageMonoGameRuntime(),
//             which downloads the pinned FadeBasic.Export.MonoGame nupkg + the
//             FadeBasic.MonoGame.{Contracts,Game,Lib} lib DLLs. No .NET SDK /
//             source tree / Wine shader bake required.
//
// The LSP needs real .dll files (not the renamed-to-.wasm Blazor variants — real
// WASM modules in .NET 8, not Assembly.Load-able). KNI + MonoGame.Framework are
// NOT staged: huge, and never needed for metadata enumeration.

import { execSync } from 'node:child_process';
import { rm, mkdir, cp, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { playgroundDir, runtimeRoot, fadeLibsDir, monogameRepoDir, pkgVersions, runtimeMode } from './lib/sources.mjs';
import { writeRuntimeManifest } from './lib/manifest.mjs';
import { stageMonoGameRuntime } from '../../packages/runtime-assets/scripts/stage.mjs';

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

if (mode === 'source') {
    console.log(`${LOG} clearing`, targetDir);
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    await mkdir(fadeLibsDir, { recursive: true });

    // The three MonoGame command DLLs the LSP loads. Package id → assembly file.
    const monoLibs = [
        'Fade.MonoGame.Contracts.dll',
        'Fade.MonoGame.Game.dll',
        'Fade.MonoGame.Lib.dll',
    ];

    // Pin the core-Fade dependency to a specific version when asked (all-source
    // builds against a locally-published core in the LocalFade feed).
    const fadeVersionArg = process.env.FADE_CORE_VERSION ? ` /p:FadeVersion=${process.env.FADE_CORE_VERSION}` : '';
    const project = resolve(monogameRepoDir, 'WebRuntime.MonoGame', 'WebRuntime.MonoGame.csproj');
    const publishOut = resolve(monogameRepoDir, 'WebRuntime.MonoGame', 'bin', 'Release', 'net8.0', 'publish', 'wwwroot');
    console.log(`${LOG} dotnet publish`, project, fadeVersionArg || '(core: csproj default)');
    execSync(`dotnet publish "${project}" -c Release /p:FadeMonoGamePlatform=Web${fadeVersionArg}`, { stdio: 'inherit' });
    if (!existsSync(publishOut)) {
        console.error(`${LOG} expected publish output at ${publishOut} but it does not exist.`);
        process.exit(1);
    }
    console.log(`${LOG} copying`, publishOut, '→', targetDir);
    await cp(publishOut, targetDir, { recursive: true });

    const libsBin = resolve(monogameRepoDir, 'WebRuntime.MonoGame', 'bin', 'Release', 'net8.0');
    for (const dll of monoLibs) {
        const src = resolve(libsBin, dll);
        if (!existsSync(src)) {
            console.error(`${LOG} expected ${src} but it does not exist.`);
            process.exit(1);
        }
        await copyFile(src, resolve(fadeLibsDir, dll));
        console.log(`${LOG} staged ${dll} → public/runtime/fade-libs/`);
    }

    await writeRuntimeManifest(targetDir, LOG);
} else {
    // Package mode is the reusable, no-.NET path — shared with the homepage.
    await stageMonoGameRuntime({
        outDir: runtimeRoot,
        monogame: pkgVersions.monogame,
        exportMonoGame: pkgVersions.exportMonoGame,
        log: LOG,
    });
}

console.log(`${LOG} done.`);
