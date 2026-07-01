# Playground Deployment

## Goal

Host the Playground at `https://dev.fadebasic.com` via GitHub Pages, separate from the
main `https://fadebasic.com` site (which lives in `homepage/` and deploys from `main.yml`).

---

## Why CI can't build the Playground automatically

The Playground's runtime is built from two .NET sources:

- **`build-runtime.mjs`** — publishes `FadeBasic/FadeBasic.Export.Web` (in this repo).
  GitHub Actions *could* build this with a .NET SDK step.
- **`build-monogame-runtime.mjs`** — publishes `../../Fade.MonoGame/...`, a sibling repo
  on the local machine that is completely outside `dby`.

`Playground/public/runtime` is gitignored, so none of the compiled output is committed.

Until `Fade.MonoGame` is either published as a NuGet package or added as a git submodule,
a full CI build isn't feasible. The pragmatic solution is to build locally and push the
pre-built `dist/` to a separate GitHub repo that serves as the Pages host.

---

## One-time setup

### 1. Create the deployment repo

Create `github.com/cdhanna/fadebasic-playground` (public or private, no initial content).

Enable GitHub Pages: Settings → Pages → Source: **Deploy from branch** → Branch: `gh-pages`.

### 2. Set the custom domain on the new repo

In that repo's Pages settings, enter `dev.fadebasic.com` as the custom domain.
GitHub will validate it once the DNS record is in place.

### 3. Add the CNAME file to the Playground

Create `Playground/public/CNAME` with a single line:

```
dev.fadebasic.com
```

Vite copies `public/` into `dist/` at build time, so the file will always be present
in whatever is pushed to the deployment repo.

### 4. Install gh-pages and add deploy scripts

```sh
cd Playground
npm install --save-dev gh-pages
```

Add to `package.json` scripts:

```json
"deploy": "gh-pages -d dist --repo git@github.com:cdhanna/fadebasic-playground.git",
"ship":   "npm run build:runtime && npm run build:monogame-runtime && npm run build && npm run deploy"
```

`gh-pages` force-pushes `dist/` to the `gh-pages` branch using local SSH credentials —
no tokens or CI configuration needed.

### 5. Add the DNS CNAME record in Squarespace

Domains → fadebasic.com → DNS Settings → Add Record:

| Field      | Value               |
|------------|---------------------|
| Type       | CNAME               |
| Host       | `dev`               |
| Points to  | `cdhanna.github.io` |

GitHub auto-provisions a Let's Encrypt certificate once DNS propagates (usually under an hour).

---

## Ongoing deploy flow

```sh
cd Playground
npm run ship
```

Which expands to:

```sh
npm run build:runtime            # dotnet publish Export.Web → public/runtime/web/
npm run build:monogame-runtime   # dotnet publish Fade.MonoGame → public/runtime/monogame/
npm run build                    # tsc + vite → dist/
npm run deploy                   # push dist/ → gh-pages branch of fadebasic-playground
```

GitHub Pages picks up the push in ~30 seconds. The `gh-pages` package creates the
`gh-pages` branch automatically on first run.

---

## Future improvements

**NuGet packages** — Publishing `FadeBasic` and `Fade.MonoGame` as NuGet packages would
allow the build scripts to pull versioned releases instead of local source paths. This
would unlock a proper GitHub Actions workflow that builds and deploys on every push to
`main` without manual intervention.

**Git submodule** — Adding `Fade.MonoGame` as a submodule of `dby` is a lighter-weight
alternative to NuGet that still enables full CI builds, at the cost of tighter coupling
between the two repos.

**itch.io export** — See the separate discussion in the conversation. Direct browser-to-itch.io
upload is blocked by CORS on `api.itch.io`. The upload button already produces a zip;
a direct "Upload to itch.io" feature would need a small relay (Cloudflare Worker or similar)
to proxy the Wharf API calls. The current "Download" zip workflow is unaffected.
