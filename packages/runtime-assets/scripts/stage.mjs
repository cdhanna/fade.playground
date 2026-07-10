#!/usr/bin/env node
// Stage the FadeBasic web runtime into an output directory by downloading the
// pinned nupkgs (FadeBasic.Export.Web + FadeBasic.Lib.Web) from the NuGet
// flat-container and extracting them. Pure Node — no .NET SDK required.
//
// This is the reusable stager: consumers (the Playground, examples,
// ../dby/homepage) call it to drop the runtime somewhere they serve
// same-origin. Layout produced under <out>/:
//   web/         ← Export.Web template (worker.js, runtime.js, _framework/*)
//   fade-libs/   ← FadeBasic.Lib.Web.dll (the LSP worker's preloaded commands)
//
// Use as a library:  import { stageWebRuntime } from '.../scripts/stage.mjs'
//                     await stageWebRuntime({ outDir })
// Use as a CLI:      node scripts/stage.mjs [--out <dir>]   (default: <pkg>/dist)
//
// Version pins come from runtime-versions.json (this package owns it);
// FADE_{EXPORT_WEB,LIB_WEB}_VERSION and FADE_NUGET_FEED override.
//
// Source-mode (dotnet publish from a checked-out dby repo) is intentionally
// NOT here — that's the Playground's engine-co-development dev loop, not the
// packaged runtime's concern.

import { rm, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchNupkgEntries, extractPrefix, extractFile } from './lib/nuget.mjs';
import { writeRuntimeManifest } from './lib/manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const pkgDir = resolve(dirname(__filename), '..'); // packages/runtime-assets/

// Pinned versions from the package's runtime-versions.json; env overrides win.
export function pinnedVersions() {
    const v = JSON.parse(readFileSync(resolve(pkgDir, 'runtime-versions.json'), 'utf8'));
    return {
        exportWeb: process.env.FADE_EXPORT_WEB_VERSION || v.exportWeb,
        libWeb: process.env.FADE_LIB_WEB_VERSION || v.libWeb,
    };
}

// Stage the web runtime into <outDir>/web + <outDir>/fade-libs. Clears only the
// web/ subtree and ensures fade-libs/ exists — sibling dirs (e.g. a consumer's
// separately-staged monogame/) are left intact.
export async function stageWebRuntime({ outDir, exportWeb, libWeb, log = '[runtime-assets:stage]' } = {}) {
    if (!outDir) throw new Error('stageWebRuntime: outDir is required');
    const pins = pinnedVersions();
    const ew = exportWeb || pins.exportWeb;
    const lw = libWeb || pins.libWeb;
    const webDir = resolve(outDir, 'web');
    const libsDir = resolve(outDir, 'fade-libs');

    console.log(`${log} exportWeb=${ew} libWeb=${lw} → ${outDir}`);
    await rm(webDir, { recursive: true, force: true });
    await mkdir(webDir, { recursive: true });
    await mkdir(libsDir, { recursive: true });

    const web = await fetchNupkgEntries('FadeBasic.Export.Web', ew);
    const n = await extractPrefix(web, 'build/wasm/', webDir);
    console.log(`${log} extracted ${n} files from FadeBasic.Export.Web ${ew} → web/`);

    const lib = await fetchNupkgEntries('FadeBasic.Lib.Web', lw);
    await extractFile(lib, 'lib/net8.0/FadeBasic.Lib.Web.dll', resolve(libsDir, 'FadeBasic.Lib.Web.dll'));
    console.log(`${log} staged FadeBasic.Lib.Web.dll → fade-libs/`);

    await writeRuntimeManifest(webDir, log);
    return { webDir, libsDir, exportWeb: ew, libWeb: lw, fileCount: n };
}

// CLI entry — only when run directly, so importing this module is side-effect-free.
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
    const i = process.argv.indexOf('--out');
    const outDir = i !== -1 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : resolve(pkgDir, 'dist');
    await stageWebRuntime({ outDir });
    console.log('[runtime-assets:stage] done.');
}
