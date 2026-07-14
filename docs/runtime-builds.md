# Runtime builds: pinned vs. from-source

The Playground (and the `../dby/homepage` docs site) compose two .NET WebAssembly
runtimes plus the Fade docs:

- **Web runtime** — `FadeBasic.Export.Web` + `FadeBasic.Lib.Web`. Ships from the
  **dby** repo, versioned together with core Fade in a single release.
- **MonoGame runtime** — `FadeBasic.Export.MonoGame` + `FadeBasic.MonoGame.{Contracts,Game,Lib}`.
  Ships from the **Fade.MonoGame** repo. It references an exact core-Fade version
  via a `PackageReference` on `$(FadeVersion)`.

## One version knob

`packages/runtime-assets/runtime-versions.json` pins **only** the Fade.MonoGame
release:

```json
{ "monogame": "0.0.2.1" }
```

The core-Fade version — and therefore the **web** runtime version, since a dby
release stamps core and `Export.Web` at the same number — is **derived** from the
MonoGame nupkg's `FadeBasic.Lang.Core` dependency (see
`runtime-assets/scripts/stage.mjs` → `resolveCoreFadeVersion`). This makes it
impossible for the web and monogame runtimes to drift onto two different core
VMs. **Bump this one value to move both runtimes in lockstep.**

Per-package escape hatches (env, rarely needed):
`FADE_MONOGAME_VERSION`, `FADE_EXPORT_MONOGAME_VERSION`, `FADE_EXPORT_WEB_VERSION`,
`FADE_LIB_WEB_VERSION`, and `FADE_NUGET_FEED` for a private/local feed.

## Two build modes

Mode is chosen by `FADE_RUNTIME_MODE` (`source` | `package` | `auto`, default
`auto` = source when the sibling repo is checked out, else package).

### Package mode (default for CI / standalone checkout)

Downloads the pinned nupkgs from nuget.org and extracts them — **no .NET SDK**.
Both runtimes:

```bash
node packages/runtime-assets/scripts/stage.mjs --out <dir>   # web + monogame
# or, in the Playground:
FADE_RUNTIME_MODE=package npm run build:runtime
FADE_RUNTIME_MODE=package npm run build:monogame-runtime
```

The homepage CI uses this (`FADE_RUNTIME_MODE=package`), so GitHub Pages needs no
.NET toolchain.

### Source mode — everything from local checkouts

Requires the .NET SDK and the `dby` + `Fade.MonoGame` repos checked out as
siblings (override with `FADE_REPO` / `FADE_MONOGAME_REPO`). One command runs the
whole chain:

```bash
npm run build:all-source
```

What it does (`scripts/build-all-source.mjs`):

1. Publishes core Fade (+ web) from dby source into the **LocalFade** dev feed at
   a unique dev version — needed because `WebRuntime.MonoGame` resolves core via a
   versioned `PackageReference`, so a locally-built core must be feed-resolvable.
2. Builds the web runtime from dby source (`ProjectReference` — no feed needed).
3. Builds the monogame runtime from Fade.MonoGame source, pinning its core
   dependency (`FADE_CORE_VERSION`) to the version published in step 1.

The unique per-run version sidesteps NuGet's restore cache. This is a heavy build
(full `install.sh` + two `dotnet publish`es); prefer package mode when you don't
need unpublished engine changes.

To build just one runtime from source (against published core):

```bash
FADE_RUNTIME_MODE=source npm run build:runtime           # web only
FADE_RUNTIME_MODE=source npm run build:monogame-runtime  # monogame only
```

## Releasing

1. Release **core Fade + web** from dby (its `Release` workflow) → publishes
   `FadeBasic.*` (core) and `FadeBasic.Export.Web`/`.Lib.Web` at one version `V`.
2. Release the **MonoGame** layer from Fade.MonoGame, pinning `FadeVersion=V`
   (exact 4-part) so its nuspec declares `FadeBasic.Lang.Core V`.
3. Bump `runtime-versions.json` `monogame` to the new Fade.MonoGame version. The
   web/core version follows automatically via derivation.
