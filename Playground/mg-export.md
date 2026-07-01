# Fade Web / itch.io Export Plan

## Goal

Allow Fade projects to be exported as self-contained static HTML5 packages suitable
for hosting on itch.io (or any static host). The export must work from two surfaces:

- **Browser Playground** — "Export" button produces a downloadable ZIP
- **Desktop** — VSCode / Rider command (or `dotnet publish`) produces the same ZIP

Both surfaces must produce byte-for-byte identical output for a given FadeBasic version.

---

## Repository Structure (target state)

```
dby/                        ← FadeBasic compiler, LSP, DAP, WebRuntime (plain web)
Fade.MonoGame/              ← MonoGame game lib, content pipeline, WebRuntime.MonoGame
Fade.Playground/            ← (future) standalone web IDE repo
```

`WebRuntime.MonoGame` moves from `dby` into `Fade.MonoGame`. This eliminates the
cross-repo `ProjectReference` that currently forces anyone cloning `dby` to also have
`Fade.MonoGame` checked out as a sibling. After the move:

- `WebRuntime.MonoGame` references `Fade.MonoGame.Lib` as a local `ProjectReference`
  (same repo — no cross-repo coordination needed at build time)
- `dby` references the resulting MonoGame WASM artifact via a pinned versioned release
  or a local path override during development

---

## Step 1: Move WebRuntime.MonoGame into Fade.MonoGame

### What moves

The entire `dby/WebRuntime.MonoGame/` folder moves to
`Fade.MonoGame/Fade.MonoGame/WebRuntime.MonoGame/`.

The cross-repo `ProjectReference` in `WebRuntime.MonoGame.csproj`:
```xml
<!-- BEFORE (in dby) -->
<ProjectReference Include="..\..\Fade.MonoGame\Fade.MonoGame\Fade.MonoGame.Lib\Fade.MonoGame.Lib.csproj">
  <SetTargetFramework>TargetFramework=net8.0</SetTargetFramework>
</ProjectReference>
```
becomes a local reference:
```xml
<!-- AFTER (in Fade.MonoGame) -->
<ProjectReference Include="..\Fade.MonoGame.Lib\Fade.MonoGame.Lib.csproj">
  <SetTargetFramework>TargetFramework=net8.0</SetTargetFramework>
</ProjectReference>
```

### What gets cleaned up in `dby`

- Remove `WebRuntime.MonoGame` from `dby`'s solution file
- Remove the `dotnet publish WebRuntime.MonoGame` step from `dby/FadeBasic/install.sh`
  (or gate it behind a `--skip-monogame-wasm` flag during transition)
- Remove WASM workload setup and MonoGame-specific CI steps from `dby/.github/workflows/release.yml`
- Update the Playground's WASM source references: the MonoGame WASM is now a versioned
  artifact from the `Fade.MonoGame` GitHub release, not a local build output

### Playground local dev after the move

Two modes (already modelled by `VITE_WASM_SOURCE`):

| Mode        | MonoGame WASM source                                        |
|-------------|-------------------------------------------------------------|
| `local`     | Build `Fade.MonoGame` repo locally; point at its publish output via `FADE_MG_WASM_PATH` env override |
| `versioned` | Download WASM artifact from `Fade.MonoGame` GitHub release matching `wasm_versions.json` |

A dev script (`Playground/scripts/build-wasm-local.sh`) can orchestrate both builds so
the developer doesn't have to remember the two `dotnet publish` paths.

---

## Step 2: Fade.MonoGame NuGet Pipeline

### Projects that need NuGet metadata (`.csproj` package properties)

Every publishable project needs `PackageId`, `Description`, `Authors`, `PackageTags`,
and `RepositoryUrl` in a shared `NugetPackage.props` (mirrors `dby/FadeBasic/NugetPackage.props`).
Then each project references `<Import Project="../NugetPackage.props"/>`.

| Project                      | PackageId                          | Notes                          |
|------------------------------|------------------------------------|--------------------------------|
| `Fade.MonoGame.Contracts`    | `Fade.MonoGame.Contracts`          | Interface types, no MonoGame dep |
| `Fade.MonoGame.Game`         | `Fade.MonoGame.Game`               | Multi-targeted net10+net8      |
| `Fade.MonoGame.Lib`          | `Fade.MonoGame.Lib`                | Command library, multi-targeted |
| `Fade.MonoGame.Content`      | `Fade.MonoGame.Content`            | Content pipeline tools         |
| `Fade.MonoGame.Templates`    | `Fade.MonoGame.Templates`          | `PackageType=Template` (new)   |
| `Fade.MonoGame.Export.Web`   | `Fade.MonoGame.Export.Web`         | WASM bundle + MSBuild targets (new) |

`WebRuntime.MonoGame` is not published as a standard NuGet package; its `dotnet publish`
output (the WASM bundle) is embedded as content inside `Fade.MonoGame.Export.Web`.

### `Directory.Build.props` additions

The existing `Directory.Build.props` only carries `FadeVersion` and `MonogameVersion`.
Add shared NuGet metadata:

```xml
<PropertyGroup>
  <Authors>Chris Hanna</Authors>
  <PackageProjectUrl>https://github.com/cshanna/Fade.MonoGame</PackageProjectUrl>
  <RepositoryUrl>https://github.com/cshanna/Fade.MonoGame</RepositoryUrl>
  <PackageTags>fadebasic;monogame;game;basic</PackageTags>
  <Copyright>Copyright © Chris Hanna</Copyright>
</PropertyGroup>
```

---

## Step 3: Fade.MonoGame.Templates (new project)

Mirrors `dby/FadeBasic/Templates/` exactly.

### Project structure

```
Fade.MonoGame/
  Fade.MonoGame.Templates/
    Templates.csproj
    templates/
      monoGame/               ← the runnable game template
        main.fbasic
        MonoGame.csproj       ← PackageReferences auto-stamped with Version at pack time
        fade.json             ← type: "monogame"
        Content/              ← sample assets
```

The template source is the `Fade.MonoGame/Fade.MonoGame/` runnable game project, stripped
of the fish-game–specific source files and replaced with a "hello world" starter.

### `Templates.csproj`

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <Import Project="../NugetPackage.props"/>
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
    <PackageId>Fade.MonoGame.Templates</PackageId>
    <Title>Fade MonoGame Project Templates</Title>
    <Description>dotnet new templates for Fade MonoGame game projects.</Description>
    <PackageType>Template</PackageType>
    <IncludeContentInPack>true</IncludeContentInPack>
    <IncludeBuildOutput>false</IncludeBuildOutput>
    <ContentTargetFolders>content</ContentTargetFolders>
  </PropertyGroup>
  <ItemGroup>
    <Content Include="templates\**\*" Exclude="templates\**\bin\**;templates\**\obj\**" />
    <Compile Remove="**\*" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="JsonPoke.MSBuild" Version="1.0.9">
      <PrivateAssets>all</PrivateAssets>
    </PackageReference>
  </ItemGroup>
  <!-- Stamp the correct version into every template csproj at pack time -->
  <Target Name="SetFadeVersionStrings" BeforeTargets="CoreBuild">
    <ItemGroup>
      <FadeProjects Include="templates/**/*.csproj" />
    </ItemGroup>
    <XmlPoke
      XmlInputPath="%(FadeProjects.Identity)"
      Query="Project/ItemGroup/PackageReference[starts-with(@Include, &quot;Fade&quot;)]/@Version"
      Value="$(Version)" />
    <XmlPoke
      XmlInputPath="%(FadeProjects.Identity)"
      Query="Project/ItemGroup/PackageReference[starts-with(@Include, &quot;FadeBasic&quot;)]/@Version"
      Value="$(FadeVersion)" />
  </Target>
</Project>
```

### Template `MonoGame.csproj` (inside `templates/monoGame/`)

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <MonoGamePlatform>DesktopGL</MonoGamePlatform>
    <FadeGenerateMain>false</FadeGenerateMain>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="FadeBasic.Lang.Core"  Version="0.0.2" />
    <PackageReference Include="FadeBasic.Build"       Version="0.0.2" />
    <PackageReference Include="FadeBasic.Lib.Standard" Version="0.0.2" />
    <PackageReference Include="Fade.MonoGame.Lib"     Version="0.0.2" />
    <PackageReference Include="Fade.MonoGame.Game"    Version="0.0.2" />
    <FadeCommand Include="FadeBasic.Lib.Standard" FullName="FadeBasic.Lib.Standard.StandardCommands" />
    <FadeCommand Include="Fade.MonoGame.Lib"      FullName="Fade.MonoGame.Lib.FadeMonoGameCommands" />
    <FadeSource Include="main.fbasic" />
  </ItemGroup>
</Project>
```

Versions are `0.0.2` placeholders; the `SetFadeVersionStrings` MSBuild target overwrites
them at pack time with the real release version.

---

## Step 4: Fade.MonoGame `install.sh`

Mirrors `dby/FadeBasic/install.sh` in structure and env-var conventions.

```bash
#!/bin/bash

VERSION=${1:-0.0.2}
BUILD_NUMBER=${2:-1}
PACKAGE_SOURCE=${3:-LocalFade}
PACKAGE_SOURCE_API_KEY=${4}

SEM_VER="${VERSION}.${BUILD_NUMBER}"
OUTPUT_FOLDER="bin/artifacts_${SEM_VER}"

SKIP_WASM=false
for arg in "$@"; do
  case $arg in --skip-wasm) SKIP_WASM=true ;; esac
done

NUGET_KEY_STR=${PACKAGE_SOURCE_API_KEY:+"--api-key $PACKAGE_SOURCE_API_KEY"}

echo "cleaning old output folders..."
rm -rf "$OUTPUT_FOLDER"

echo "installing Fade.MonoGame version=${SEM_VER}"

BUILD_ARGS="-c Release /p:Version=$SEM_VER /p:FadeInstall=true"
dotnet clean Fade.MonoGame.sln -c Release
dotnet build Fade.MonoGame.sln $BUILD_ARGS

PACK_ARGS="--output $OUTPUT_FOLDER /p:Version=$SEM_VER --include-symbols --include-source -p:SymbolPackageFormat=snupkg -c Release"
dotnet pack ./Fade.MonoGame.Contracts $PACK_ARGS
dotnet pack ./Fade.MonoGame.Game      $PACK_ARGS
dotnet pack ./Fade.MonoGame.Lib       $PACK_ARGS
dotnet pack ./Fade.MonoGame.Content   $PACK_ARGS
dotnet pack ./Fade.MonoGame.Templates $PACK_ARGS

if [ "$SKIP_WASM" = false ]; then
  echo "building WebRuntime.MonoGame WASM bundle..."
  dotnet publish ./WebRuntime.MonoGame -c Release -o staging/wasm-monogame
  dotnet pack ./Fade.MonoGame.Export.Web $PACK_ARGS
else
  echo "skipping WASM build (--skip-wasm)"
fi

if [ -z "$FADE_USE_LOCAL_SOURCE" ]; then
  if [ -z "$FADE_NUGET_DRYRUN" ]; then
    echo "pushing packages to ${PACKAGE_SOURCE}"
    dotnet nuget push "$OUTPUT_FOLDER/*.$BUILD_NUMBER.nupkg" --source "$PACKAGE_SOURCE" $NUGET_KEY_STR
  else
    echo "skipping NuGet push (FADE_NUGET_DRYRUN is set)"
  fi
else
  echo "pushing Fade.MonoGame to local!"
  dotnet nuget list source
  ./setup.sh
  dotnet nuget list source
  dotnet nuget push "$OUTPUT_FOLDER/*.$BUILD_NUMBER.nupkg" --source "LocalFade"
fi
```

`--skip-wasm` is the escape hatch for local language/command iteration where rebuilding
the WASM bundle is unnecessary. All non-WASM packages still publish normally.

---

## Step 5: Fade.MonoGame `release.yml`

Mirrors `dby/.github/workflows/release.yml`. Key additions vs. the FadeBasic workflow:

```yaml
- uses: actions/setup-dotnet@v3
  with:
    dotnet-version: |
      8.0.x     # WebRuntime.MonoGame (Blazor WASM, net8)
      10.0.x    # game projects, content pipeline

- name: Install WASM workloads
  run: dotnet workload install wasm-tools

- name: Run Build Script
  working-directory: ./Fade.MonoGame
  run: bash ./install.sh ${{ inputs.majorSemver }}.${{ inputs.minorSemver }}.${{ inputs.patchSemver }} 1 ${{ secrets.NUGET_HOST }} ${{ secrets.NUGET_API_KEY }}

- name: Upload WASM bundle as release asset
  uses: actions/upload-artifact@v4
  with:
    name: wasm-monogame
    path: Fade.MonoGame/staging/wasm-monogame/wwwroot/**
```

- `timeout-minutes`: raise to 25 (WASM publish + workload install adds ~5 min)
- Upload the WASM bundle as a GitHub release asset so Playground can reference it by
  version tag URL without re-building

---

## Step 6: FadeBasic `install.sh` modifications (dby)

The existing `dby/FadeBasic/install.sh` gains a `--skip-wasm` flag and two new steps
that publish `WebRuntime` (the plain web worker, net10) and pack it into
`FadeBasic.Export.Web`.

### `--skip-wasm` flag

```bash
SKIP_WASM=false
for arg in "$@"; do
  case $arg in --skip-wasm) SKIP_WASM=true ;; esac
done
```

Add after the existing positional-argument block. The flag skips only the WASM steps;
all language/LSP/DAP packages pack as normal.

### New WASM steps (after the existing `dotnet pack` calls)

```bash
if [ "$SKIP_WASM" = false ]; then
  echo "building WebRuntime WASM bundle..."
  dotnet publish ../WebRuntime -c Release -o staging/wasm-web
  dotnet pack ./FadeBasic.Export.Web $PACK_ARGS
else
  echo "skipping WASM build (--skip-wasm)"
fi
```

`WebRuntime` targets `net10.0`, so `release.yml` needs dual-dotnet setup (see Step 7).

### `FadeBasic.Export.Web` project (new, in dby)

Lives alongside the other `FadeBasic.*` projects. It is not part of the language build;
it only participates when `SKIP_WASM=false`. Its `.csproj` embeds the published WASM
bundle as NuGet content files:

```xml
<ItemGroup>
  <!-- Populated by install.sh before pack runs -->
  <Content Include="staging/wasm-web/wwwroot/**"
           PackagePath="content/wasm-web/%(RecursiveDir)%(Filename)%(Extension)" />
</ItemGroup>
```

plus a `build/FadeBasic.Export.Web.targets` file that hooks `dotnet publish` on the
consumer's game project to assemble the export ZIP.

### `dby release.yml` additions (Step 7)

```yaml
- uses: actions/setup-dotnet@v3
  with:
    dotnet-version: |
      8.0.x     # existing (tests, LSP, DAP)
      10.0.x    # WebRuntime targets net10

- name: Install WASM workloads
  run: dotnet workload install wasm-tools
```

- `timeout-minutes`: raise from 10 → 25
- Upload `staging/wasm-web/wwwroot/**` as a GitHub release asset alongside the Rider zip

---

## Export format

A self-contained static ZIP:

```
index.html              ← auto-boots the game, no editor UI
_framework/             ← Blazor / WASM runtime (dotnet.wasm, dotnet.js, …)
assets/                 ← textures, sounds, fonts (XNB, sanitized for WASM)
fade-program.bin        ← compiled FadeBasic bytecode
fade-manifest.json      ← version manifest (see below)
```

`fade-manifest.json`:

```json
{
  "fadeBasic": "1.3.0",
  "fadeMonoGame": "1.3.0",
  "exportFormat": "1"
}
```

---

## Two export types (matching `fade.json` `type`)

| `fade.json` type | WASM runtime             | NuGet export package             | Repo          |
|------------------|--------------------------|----------------------------------|---------------|
| `"web"`          | `WebRuntime` (worker)    | `FadeBasic.Export.Web`           | `dby`         |
| `"monogame"`     | `WebRuntime.MonoGame`    | `Fade.MonoGame.Export.Web`       | `Fade.MonoGame` |

---

## NuGet export package contents

Each export NuGet package contains:

- **Pre-built WASM bundle** — the full `dotnet publish` output of the corresponding
  runtime project, embedded as NuGet content files
- **MSBuild `.targets`** — hooks `dotnet publish` on the user's game project to
  compile `.fbasic` source, bundle assets, copy the WASM frame, and produce the ZIP
- **`index.html` template** — the game loader; no editor chrome
- **`FadeExporter` class** — C# library that owns the canonical output layout
  (file names, manifest format, asset bundling rules)

The spec lives in C#. Both the browser export button and `dotnet publish` call into
`FadeExporter`; neither surface reimplements the layout logic.

---

## Version alignment

- **Same minor = bytecode-compatible.** `Fade.MonoGame 1.3.x` works with `FadeBasic 1.3.x`.
- **Minor bump = breaking change.** A bytecode format change in FadeBasic bumps the minor;
  Fade.MonoGame must cut a matching minor release referencing the new FadeBasic.
- **Patch versions** are independent — bug fixes, no contract change.

Document this contract in `COMPATIBILITY.md` in each repo before external consumers appear.

---

## Playground: local source vs. pinned version

### `wasm_versions.json`

```json
{
  "fadeBasic": "1.3.0",
  "fadeMonoGame": "1.3.0"
}
```

Single file to update when the published Playground should track a new release.

### Build modes (`VITE_WASM_SOURCE`)

| Mode        | How `public/framework/` is populated                                    |
|-------------|-------------------------------------------------------------------------|
| `local`     | Dev builds both runtimes from sibling repo source; `FADE_MG_WASM_PATH` points at Fade.MonoGame publish output |
| `versioned` | CI downloads WASM artifacts from GitHub releases matching `wasm_versions.json` |

---

## Playground export button

Once all the above exists, the browser-side "Export for itch.io" button:

1. Calls `FadeExporter` via the existing WebRuntime JSExport surface to compile
   the source and assemble the export manifest
2. Fetches the versioned WASM bundle (already loaded at page startup — can be
   extracted from the service worker cache or re-fetched from the known asset URL)
3. Bundles assets from OPFS
4. Produces a ZIP download using a client-side zip library

---

## Work sequence

| Step | Work                                                           | Repo            | Unblocked by  |
|------|----------------------------------------------------------------|-----------------|---------------|
| 1    | Move `WebRuntime.MonoGame` into `Fade.MonoGame`                | Fade.MonoGame   | nothing       |
| 2    | Clean up `dby`: remove project + CI steps                      | dby             | step 1        |
| 3    | `NugetPackage.props` + csproj metadata on all FM projects      | Fade.MonoGame   | step 1        |
| 4    | `Fade.MonoGame.Templates` project                              | Fade.MonoGame   | step 3        |
| 5    | `Fade.MonoGame install.sh` + `setup.sh`                        | Fade.MonoGame   | step 3        |
| 6    | `Fade.MonoGame release.yml`                                    | Fade.MonoGame   | step 5        |
| 7    | `FadeBasic.Export.Web` package (new project in dby)            | dby             | nothing       |
| 8    | `dby install.sh` `--skip-wasm` + WebRuntime publish/pack steps | dby             | step 7        |
| 9    | `dby release.yml` dual-dotnet + WASM workload + asset upload   | dby             | step 8        |
| 10   | `Fade.MonoGame.Export.Web` package                             | Fade.MonoGame   | steps 1+5     |
| 11   | Playground `wasm_versions.json` + dual build mode              | dby             | steps 7+10    |
| 12   | Playground export UI button                                    | dby             | step 11       |

Steps 1 and 7 are independently unblocked today. Step 1 is the critical path for
everything on the MonoGame side.

---

## Critical Unanswered Notes

- How does a local-based export work (desktop game project using local NuGet feed)?
- XNB sanitization layer: which TypeReader fields differ between desktop KNI and browser KNI WASM?
  Need to audit against KNI source before implementing `FadeXnbSanitizer`.
- `.fx` shader export for web: dxc.wasm + spirv-cross.wasm pipeline is the target approach;
  the KNI WASM runtime would need to load GLSL/SPIR-V instead of DXIL — requires a separate
  effect TypeReader for the web export path.
