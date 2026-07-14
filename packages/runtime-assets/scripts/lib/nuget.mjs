// Minimal, pure-Node NuGet package consumer for the runtime build scripts'
// 'package' mode. A nupkg is just a zip, and nuget.org's flat-container serves
// it by exact id+version — so we fetch it and unzip in-memory (fflate, already
// a Playground dependency). No .NET SDK, no `dotnet restore`, no auth for the
// public feed. Override the feed with FADE_NUGET_FEED for a private source.

import { unzipSync } from 'fflate';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_FEED = 'https://api.nuget.org/v3-flatcontainer';

// Download a nupkg and return its entries as { [zipPath]: Uint8Array }.
export async function fetchNupkgEntries(id, version, feed = process.env.FADE_NUGET_FEED || DEFAULT_FEED) {
    const lid = id.toLowerCase();
    const base = feed.replace(/\/+$/, '');
    const url = `${base}/${lid}/${version}/${lid}.${version}.nupkg`;
    console.log(`[nuget] fetch ${id} ${version}`);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`[nuget] ${id} ${version} → HTTP ${res.status}\n         ${url}`);
    }
    return unzipSync(new Uint8Array(await res.arrayBuffer()));
}

// Write every file entry under `prefix` into destDir, stripping the prefix.
// Returns the count written; throws if nothing matched (guards silent misses
// when a package's internal layout changes).
export async function extractPrefix(entries, prefix, destDir) {
    let n = 0;
    for (const [path, data] of Object.entries(entries)) {
        if (!path.startsWith(prefix) || path.endsWith('/')) continue;
        const rel = path.slice(prefix.length);
        if (!rel) continue;
        const dest = resolve(destDir, rel);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, data);
        n++;
    }
    if (n === 0) throw new Error(`[nuget] no entries under "${prefix}" — package layout changed?`);
    return n;
}

// Extract one named entry (e.g. a lib DLL) to a destination file path.
export async function extractFile(entries, entryPath, destFile) {
    const data = entries[entryPath];
    if (!data) throw new Error(`[nuget] entry not found: ${entryPath}`);
    await mkdir(dirname(destFile), { recursive: true });
    await writeFile(destFile, data);
}

// Read the declared version of a <dependency> from a nupkg's .nuspec (the one
// *.nuspec entry at the archive root). Used to DERIVE the core-Fade version a
// MonoGame runtime was built against, so the web + monogame runtimes always run
// the same core VM (see stage.mjs resolveCoreFadeVersion). Throws if the
// package declares no such dependency — a loud failure beats a silent skew.
export function readNuspecDependency(entries, depId) {
    const key = Object.keys(entries).find((p) => p.toLowerCase().endsWith('.nuspec'));
    if (!key) throw new Error('[nuget] no .nuspec entry in package');
    const xml = new TextDecoder().decode(entries[key]);
    const re = new RegExp(`<dependency\\s+id="${depId.replace(/\./g, '\\.')}"\\s+version="([^"]+)"`, 'i');
    const m = xml.match(re);
    if (!m) throw new Error(`[nuget] .nuspec declares no dependency "${depId}"`);
    return m[1];
}
