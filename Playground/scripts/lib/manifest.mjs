// Shared runtime-manifest.json writer for the web + monogame runtime builds.
// A static host can't list a directory over fetch, so we enumerate every file
// under the runtime target at build time; the Playground's export bundler reads
// this to know what to include in the static-host zip.

import { readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

async function walk(dir) {
    const out = [];
    for (const ent of await readdir(dir, { withFileTypes: true })) {
        const full = resolve(dir, ent.name);
        if (ent.isDirectory()) out.push(...await walk(full));
        else if (ent.isFile()) out.push(full);
    }
    return out;
}

// POSIX-relative file list under targetDir → targetDir/runtime-manifest.json.
export async function writeRuntimeManifest(targetDir, logPrefix) {
    const files = await walk(targetDir);
    const relPaths = files
        .map((f) => relative(targetDir, f).split('\\').join('/'))
        .filter((p) => p !== 'runtime-manifest.json')
        .sort();
    await writeFile(
        resolve(targetDir, 'runtime-manifest.json'),
        JSON.stringify({ files: relPaths }, null, 2),
    );
    console.log(`${logPrefix} wrote runtime-manifest.json (${relPaths.length} entries)`);
}
