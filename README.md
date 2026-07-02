# Fade.Playground

The web-facing side of Fade: the browser Playground and its companion apps.
This repo is a **consumer** of two library repos — the Fade language core
([`dby`](https://github.com/cdhanna/dby)) and the MonoGame runtime
([`Fade.MonoGame`](https://github.com/cdhanna/fade.mono)) — and releases
independently of them.

## Projects

| Directory | What it is |
|---|---|
| [`Playground/`](Playground/) | The Vite + Monaco IDE users drive — editor, debugger, collaborative sessions, and the two in-browser runtimes (Fade web + MonoGame/KNI WASM). |
| [`ghostBot/`](ghostBot/) | Tauri desktop companion that pairs with a Playground session over WebRTC (AI pairing / remote assist). |
| [`oauth-proxy/`](oauth-proxy/) | Stateless Cloudflare Worker fronting GitHub's device-flow endpoints (CORS proxy for sign-in). |

Each subproject has its own README with details.

## How the runtimes are sourced

The Playground doesn't contain the Fade or MonoGame engines — it pulls their
compiled **web runtimes** (Blazor/KNI WASM bundles) and stages them under
`Playground/public/runtime/`. There are two modes, resolved per-runtime in
[`Playground/scripts/lib/sources.mjs`](Playground/scripts/lib/sources.mjs):

- **`package`** — download the pinned published nupkgs (`FadeBasic.Export.Web`,
  `FadeBasic.Export.MonoGame`, …) and extract them. Pure Node, no .NET SDK.
  Versions are pinned in [`Playground/runtime-versions.json`](Playground/runtime-versions.json).
- **`source`** — build the runtimes from the sibling `dby` / `Fade.MonoGame`
  repos via `dotnet publish`. Fast loop when you're co-developing the engines.

The default is **`auto`**: `source` when the relevant sibling repo is checked
out next door, otherwise `package`. Override with env vars:

| Env | Purpose |
|---|---|
| `FADE_RUNTIME_MODE` | force `source` or `package` |
| `FADE_REPO` | path to the FadeBasic repo (default `../../dby/FadeBasic`) |
| `FADE_MONOGAME_REPO` | path to the Fade.MonoGame solution (default `../../Fade.MonoGame/Fade.MonoGame`) |
| `FADE_DOCS` | path to the FadeBook docs (default `<FADE_REPO>/book/FadeBook`) |
| `FADE_NUGET_FEED` | flat-container base URL for package mode |
| `FADE_*_VERSION` | override an individual pinned package version |

### Source-mode layout

For the `source`-mode defaults to work, clone all three repos under one parent:

```
Github/
├── Fade.Playground/   ← this repo
├── dby/               ← Fade language core (FadeBasic/…)
└── Fade.MonoGame/     ← MonoGame runtime
```

## Quickstart

```sh
cd Playground
npm install
npm run dev          # predev builds the web runtime, then starts Vite
```

With no sibling repos present this runs in `package` mode against the pinned
published runtimes — a standalone checkout just works.

## Tests

- **Playground unit/integration:** `cd Playground && npx vitest run`
- **Playwright probes:** `cd Playground && node scripts/probe-*.mjs` (needs `npm run dev` running)
- **ghostBot:** `cd ghostBot && npm test`

## CI & deploy (GitHub Actions)

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | push to `main`, PRs | Build + test the Playground (package-mode runtimes, `tsc`, `vitest`), ghostBot (`npm test`), and oauth-proxy (`typecheck`). |
| `deploy-test.yml` | push to `main` (auto) + manual | Deploy to the test alias → `https://tests.fade-playground.pages.dev`. |
| `deploy-prod.yml` | manual only (enter a version) | Deploy to production, then tag `vX.Y.Z` and cut a GitHub Release whose notes are the matching `## [X.Y.Z]` section of `CHANGELOG.md`. |
| `_deploy-pages.yml` | reusable | Shared build + `wrangler pages deploy` used by both deploy workflows. |
| `ghostbot-release.yml` | manual + `ghostbot-v*` tags | Build the ghostBot Tauri app (macOS + Windows) → GitHub Release. |

Deploys build the web runtimes in **package mode** (no .NET on the runner) and
`wrangler pages deploy dist --project-name=fade-playground`.

**Required repo secrets** (Settings → Secrets → Actions):

- `CLOUDFLARE_API_TOKEN` — token with *Cloudflare Pages: Edit*
- `CLOUDFLARE_ACCOUNT_ID` — the account owning the `fade-playground` project
- ghostBot signing (optional; unset = unsigned build): `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

## Releasing

The Playground releases on its own cadence:

1. Bump the runtime it ships (if needed) in `Playground/runtime-versions.json`.
2. Add a `## [X.Y.Z] - YYYY-MM-DD` section to [`CHANGELOG.md`](CHANGELOG.md)
   describing the release.
3. Run **Actions → Deploy (production)** and enter `X.Y.Z`.

That deploys to production, tags `vX.Y.Z`, and creates a GitHub Release using
that changelog section as the notes (same pattern as fade's dby release).
