#!/usr/bin/env node
// Stage the FadeBasic web + MonoGame runtimes into an output directory by
// downloading the pinned nupkgs from the NuGet flat-container and extracting
// them. Pure Node — no .NET SDK required.
//
// This is the reusable stager: consumers (the Playground, examples,
// ../dby/homepage) call it to drop the runtime somewhere they serve
// same-origin. Layout produced under <out>/:
//   web/         ← Export.Web template (worker.js, runtime.js, _framework/*)
//   monogame/    ← Export.MonoGame template (KNI BlazorGL + Game1 runtime)
//   fade-libs/   ← the LSP worker's preloaded command DLLs (web + monogame)
//
// SINGLE VERSION KNOB. runtime-versions.json pins only `monogame` (the
// Fade.MonoGame release). The core-Fade version — and therefore the Web runtime
// (FadeBasic.Export.Web / .Lib.Web, which a dby release stamps at the same
// version as core) — is DERIVED from that MonoGame nupkg's FadeBasic.Lang.Core
// dependency. So the web and monogame runtimes can never drift onto two
// different core VMs. Override any derived value with
// FADE_{EXPORT_WEB,LIB_WEB,EXPORT_MONOGAME,MONOGAME}_VERSION; point at a private
// feed with FADE_NUGET_FEED.
//
// Use as a library:  import { stageWebRuntime, stageMonoGameRuntime } from '.../stage.mjs'
// Use as a CLI:      node scripts/stage.mjs [--out <dir>]   (default: <pkg>/dist)
//                    → stages BOTH web + monogame into <out>.
//
// Source-mode (dotnet publish from checked-out repos) is intentionally NOT here
// — that's the Playground's engine-co-development dev loop, not the packaged
// runtime's concern.

import { rm, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchNupkgEntries, extractPrefix, extractFile, readNuspecDependency } from './lib/nuget.mjs';
import { writeRuntimeManifest } from './lib/manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const pkgDir = resolve(dirname(__filename), '..'); // packages/runtime-assets/

// The three MonoGame command DLLs the LSP loads (package id → assembly file).
// The iframe's Game1 owns actual execution; the LSP only needs the metadata.
const MONO_LIBS = [
    { pkg: 'FadeBasic.MonoGame.Contracts', dll: 'Fade.MonoGame.Contracts.dll' },
    { pkg: 'FadeBasic.MonoGame.Game', dll: 'Fade.MonoGame.Game.dll' },
    { pkg: 'FadeBasic.MonoGame.Lib', dll: 'Fade.MonoGame.Lib.dll' },
];

// The single pinned version: the Fade.MonoGame release. Env override wins.
export function monogameVersion() {
    const v = JSON.parse(readFileSync(resolve(pkgDir, 'runtime-versions.json'), 'utf8'));
    return process.env.FADE_MONOGAME_VERSION || v.monogame;
}

// Derive the core-Fade version from the MonoGame layer's nuspec — a network
// read, so cached per monogame version. FadeBasic.MonoGame.Game is the package
// that declares the direct `FadeBasic.Lang.Core` PackageReference (Export.MonoGame
// only depends on it transitively). FADE_EXPORT_WEB_VERSION short-circuits this
// (and avoids the fetch) for the rare case you want to pin the web runtime to a
// different core than the monogame side.
const _coreCache = new Map();
export async function resolveCoreFadeVersion(mgVersion = monogameVersion()) {
    if (process.env.FADE_EXPORT_WEB_VERSION) return process.env.FADE_EXPORT_WEB_VERSION;
    if (_coreCache.has(mgVersion)) return _coreCache.get(mgVersion);
    const entries = await fetchNupkgEntries('FadeBasic.MonoGame.Game', mgVersion);
    const core = readNuspecDependency(entries, 'FadeBasic.Lang.Core');
    _coreCache.set(mgVersion, core);
    return core;
}

// Fully-resolved version set. exportWeb/libWeb are derived from the monogame
// pin unless explicitly overridden; exportMonoGame defaults to the monogame pin
// (same Fade.MonoGame install.sh stamp), overridable independently.
export async function pinnedVersions() {
    const mg = monogameVersion();
    const core = await resolveCoreFadeVersion(mg);
    return {
        monogame: mg,
        exportMonoGame: process.env.FADE_EXPORT_MONOGAME_VERSION || mg,
        exportWeb: process.env.FADE_EXPORT_WEB_VERSION || core,
        libWeb: process.env.FADE_LIB_WEB_VERSION || core,
    };
}

// Stage the web runtime into <outDir>/web + <outDir>/fade-libs. Clears only the
// web/ subtree and ensures fade-libs/ exists — sibling dirs (e.g. monogame/)
// are left intact.
export async function stageWebRuntime({ outDir, exportWeb, libWeb, log = '[runtime-assets:stage]' } = {}) {
    if (!outDir) throw new Error('stageWebRuntime: outDir is required');
    if (!exportWeb || !libWeb) {
        const pins = await pinnedVersions();
        exportWeb = exportWeb || pins.exportWeb;
        libWeb = libWeb || pins.libWeb;
    }
    const webDir = resolve(outDir, 'web');
    const libsDir = resolve(outDir, 'fade-libs');

    console.log(`${log} exportWeb=${exportWeb} libWeb=${libWeb} → ${outDir}`);
    await rm(webDir, { recursive: true, force: true });
    await mkdir(webDir, { recursive: true });
    await mkdir(libsDir, { recursive: true });

    const web = await fetchNupkgEntries('FadeBasic.Export.Web', exportWeb);
    const n = await extractPrefix(web, 'build/wasm/', webDir);
    console.log(`${log} extracted ${n} files from FadeBasic.Export.Web ${exportWeb} → web/`);

    const lib = await fetchNupkgEntries('FadeBasic.Lib.Web', libWeb);
    await extractFile(lib, 'lib/net8.0/FadeBasic.Lib.Web.dll', resolve(libsDir, 'FadeBasic.Lib.Web.dll'));
    console.log(`${log} staged FadeBasic.Lib.Web.dll → fade-libs/`);

    await writeRuntimeManifest(webDir, log);
    return { webDir, libsDir, exportWeb, libWeb, fileCount: n };
}

// Stage the MonoGame runtime into <outDir>/monogame + <outDir>/fade-libs.
// Clears only the monogame/ subtree; leaves web/ intact. Mirrors the web
// stager, so package-mode consumers get a symmetric no-.NET path.
export async function stageMonoGameRuntime({ outDir, monogame, exportMonoGame, log = '[runtime-assets:stage]' } = {}) {
    if (!outDir) throw new Error('stageMonoGameRuntime: outDir is required');
    if (!monogame || !exportMonoGame) {
        const pins = await pinnedVersions();
        monogame = monogame || pins.monogame;
        exportMonoGame = exportMonoGame || pins.exportMonoGame;
    }
    const monoDir = resolve(outDir, 'monogame');
    const libsDir = resolve(outDir, 'fade-libs');

    console.log(`${log} exportMonoGame=${exportMonoGame} monogame=${monogame} → ${outDir}`);
    await rm(monoDir, { recursive: true, force: true });
    await mkdir(monoDir, { recursive: true });
    await mkdir(libsDir, { recursive: true });

    const rt = await fetchNupkgEntries('FadeBasic.Export.MonoGame', exportMonoGame);
    const n = await extractPrefix(rt, 'build/wasm/', monoDir);
    console.log(`${log} extracted ${n} files from FadeBasic.Export.MonoGame ${exportMonoGame} → monogame/`);

    for (const { pkg, dll } of MONO_LIBS) {
        const entries = await fetchNupkgEntries(pkg, monogame);
        await extractFile(entries, `lib/net8.0/${dll}`, resolve(libsDir, dll));
        console.log(`${log} staged ${dll} → fade-libs/`);
    }

    await writeRuntimeManifest(monoDir, log);
    return { monoDir, libsDir, exportMonoGame, monogame, fileCount: n };
}

// CLI entry — only when run directly, so importing this module is side-effect-free.
// Stages BOTH runtimes so a single `node stage.mjs --out X` fully populates X.
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
    const i = process.argv.indexOf('--out');
    const outDir = i !== -1 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : resolve(pkgDir, 'dist');
    await stageWebRuntime({ outDir });
    await stageMonoGameRuntime({ outDir });
    console.log('[runtime-assets:stage] done.');
}
