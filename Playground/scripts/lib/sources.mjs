// Central resolver for where the Playground's build scripts get their inputs.
//
// The Playground composes two .NET web runtimes (FadeBasic core + MonoGame) plus
// the Fade docs. Historically those were reached via hardcoded relative paths
// into sibling directories of the dby monorepo. This module makes every such
// location env-overridable and adds a source-vs-package MODE, so the Playground
// can build either from checked-out sibling repos (fast dev loop) or from
// published nupkgs (standalone repo / CI with no .NET source tree).
//
// Env overrides (defaults assume dby + Fade.MonoGame are cloned as siblings of
// this repo — all three under one parent directory):
//   FADE_REPO            → the FadeBasic repo dir           (default: ../../dby/FadeBasic)
//   FADE_MONOGAME_REPO   → the Fade.MonoGame solution dir   (default: ../../Fade.MonoGame/Fade.MonoGame)
//   FADE_DOCS            → the FadeBook docs dir            (default: <FADE_REPO>/book/FadeBook)
//   FADE_RUNTIME_MODE    → 'source' | 'package' | 'auto'    (default: auto)
//   FADE_NUGET_FEED      → flatcontainer base URL for package mode
//   FADE_{EXPORT_WEB,LIB_WEB,EXPORT_MONOGAME,MONOGAME}_VERSION → pin overrides

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// scripts/lib/ → Playground/
export const playgroundDir = resolve(__dirname, '..', '..');
export const runtimeRoot = resolve(playgroundDir, 'public', 'runtime');
export const fadeLibsDir = resolve(runtimeRoot, 'fade-libs');

// Sibling source repos. Defaults assume dby (the Fade core repo) and
// Fade.MonoGame are cloned next to this repo; override with env otherwise.
// When a repo isn't present, that runtime falls back to 'package' mode.
export const fadeRepoDir = process.env.FADE_REPO
    ? resolve(process.env.FADE_REPO)
    : resolve(playgroundDir, '..', '..', 'dby', 'FadeBasic');
export const monogameRepoDir = process.env.FADE_MONOGAME_REPO
    ? resolve(process.env.FADE_MONOGAME_REPO)
    : resolve(playgroundDir, '..', '..', 'Fade.MonoGame', 'Fade.MonoGame');
export const fadeDocsDir = process.env.FADE_DOCS
    ? resolve(process.env.FADE_DOCS)
    : resolve(fadeRepoDir, 'book', 'FadeBook');

// Pinned package versions (used in 'package' mode); env overrides win.
const versions = JSON.parse(readFileSync(resolve(playgroundDir, 'runtime-versions.json'), 'utf8'));
export const pkgVersions = {
    exportWeb: process.env.FADE_EXPORT_WEB_VERSION || versions.exportWeb,
    libWeb: process.env.FADE_LIB_WEB_VERSION || versions.libWeb,
    exportMonoGame: process.env.FADE_EXPORT_MONOGAME_VERSION || versions.exportMonoGame,
    monogame: process.env.FADE_MONOGAME_VERSION || versions.monogame,
};

// 'source' builds from the sibling repo; 'package' downloads pinned nupkgs.
// 'auto' (default) picks source when the relevant repo is checked out next
// door, else package — so a standalone Playground checkout just works.
export function runtimeMode(kind /* 'web' | 'monogame' */) {
    const explicit = (process.env.FADE_RUNTIME_MODE || '').toLowerCase();
    if (explicit === 'source' || explicit === 'package') return explicit;
    const repo = kind === 'monogame' ? monogameRepoDir : fadeRepoDir;
    return existsSync(repo) ? 'source' : 'package';
}
