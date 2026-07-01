# Web Export Refactor — Working Notes

This document captures the structural and runtime-loader work that landed
while getting `FadeBasic.Export.Web` to produce a working game bundle from a
plain Fade project (verified end-to-end with `/SAM/Fade.Web.Test`).

## 1. Project rename: `WebRuntime` → `FadeBasic.Export.Web`

The WASM project was moved into the FadeBasic source tree so its name matches
its NuGet identity. Touched:

- `WebRuntime/` → `FadeBasic/FadeBasic.Export.Web/`
- `WebRuntime.csproj` → `FadeBasic.Export.Web.csproj`. `AssemblyName` and
  `RootNamespace` both set to `FadeBasic.Export.Web`; project references
  point one level up into sibling FadeBasic projects.
- C# `namespace WebRuntime;` → `namespace FadeBasic.Export.Web;` across
  `FadeBridge.cs`, `WebDebugSession.cs`, `StandardCommandDocs.cs`.
- `wwwroot/worker.js`: 38× `exports.WebRuntime.FadeBridge.X` →
  `exports.FadeBasic.Export.Web.FadeBridge.X`. The JS surface follows
  the .NET namespace because the WASM exports object nests by namespace.
- `Playground/scripts/build-runtime.mjs` paths and `install.sh` subshell
  updated to the new location.
- `.gitignore` patterns for `staging/` and the `build/` exception updated.

## 2. Dynamic command DLLs

`FadeBasic.Export.Web` no longer references `FadeBasic.Lib.Web` at compile
time. Command surfaces are wired in at runtime by the page:

- `fade.json` `commandDlls` is now an array of `{ assembly, class }` —
  mirrors the MSBuild `<FadeCommand Include="..." FullName="..." />` item.
  Both the JSON schema and `Playground/src/fade-config.ts` validator were
  upgraded; no back-compat shim because nothing had shipped.
- New `FadeBridge` JSExports:
  - `RegisterCommandAssembly(byte[] dllBytes, string className)` — loads
    the assembly, instantiates the named class as `IMethodSource`, merges
    into the workspace.
  - `ClearCommandAssemblies()` — drops registered sources, rebuilds the
    workspace.
- The Playground's `refreshFadeProject()` syncs both workers (LSP + VM)
  when the project type or commandDlls list changes. Auto-injects
  `FadeBasic.Lib.Web` for `web`-type projects.
- `build-runtime.mjs` now also builds `FadeBasic.Lib.Web` and stages the
  DLL under `Playground/public/runtime/fade-libs/`.

## 3. Export pipeline

The Export.Web nupkg ships a `build/FadeBasic.Export.Web.targets` file
auto-imported by MSBuild on consumers:

- After `Publish`, copies the WASM bundle into `$(PublishDir)web/`.
- Copies all `$(OutDir)*.dll` into `web/game/`.
- Writes `fade-manifest.json` with `exportFormat`, `entryAssembly` (the
  consumer's `$(TargetName).dll` carrying the generated `ILaunchable`),
  and a `deps` array of every other DLL the launcher must pre-load. Static
  hosts can't list directories so the manifest is authoritative.

The replaced `wwwroot/index.html` is a minimal game launcher (no editor
chrome): single VM-role worker, fetch manifest, pre-load deps, then
`load-and-run` on the entry. Print/alert messages render straight to the
page.

New `FadeBridge` JSExports for this path:

- `LoadAssembly(byte[])` — load a dep into the AppDomain without
  registering it as a command source.
- `LoadAndRun(byte[])` — load entry, reflectively find `ILaunchable`,
  instantiate, `vm.Execute2(0)`. Mirrors `Launcher.Run<T>()` without the
  generic constraint.

## 4. Assembly resolution under WASM

`Assembly.Load(byte[])` succeeds in WASM but the default
`AssemblyLoadContext` doesn't fall back to "scan loaded assemblies by simple
name" when binding by reference. When the entry assembly's cctor does
`new FadeBasic.Lib.Web.WebCommands()`, the runtime resolves the reference
through the assembly resolver — which doesn't find the byte-loaded copy.

Fix: `LoadAndRegister` stores every dynamically-loaded assembly in a
dictionary, and a one-shot `AssemblyLoadContext.Default.Resolving` hook
returns from that dictionary. Framework assemblies already in `_framework/`
keep being found by default resolution; only the dynamic ones go through
the hook.

## 5. Trimming disabled on the WASM bundle

`<PublishTrimmed>false</PublishTrimmed>` on `FadeBasic.Export.Web.csproj`.

The trimmer can't see references inside dynamically-loaded assemblies, so
types only used by the consumer's game DLL (e.g. `System.Span<T>` referenced
by JSImport-generated marshalling for string-returning calls like `prompt$`)
get stripped, and JIT later fails with `TypeLoadException`. Symptom that
flagged it: `print` worked but `prompt$` blew up because string-return
marshalling needs `Span<T>` while void-return marshalling doesn't.

The bundle grows to ~29MB / 175 .wasm files. Can be reclaimed later via
explicit `<TrimmerRootAssembly Include="System.Runtime" />` plus targeted
roots, once the dynamic-load surface stabilizes.

## 6. Framework: stay on net8

Briefly tried net10 to match Export.Web's original TFM. Reverted because:

- net8 covers all the same Blazor functionality we need.
- Lib.Web is net8; the WASM runtime must match the framework version of the
  dynamically-loaded DLLs (cross-version type forwards for things like
  `System.Span<T>` aren't reliable under WASM trim).
- Most of FadeBasic is net8; alignment is simpler.
- KNI / WebRuntime.MonoGame stays on net8.

Consequences:
- Deleted `FadeBasic.Export.Web/global.json` — root `FadeBasic/global.json`
  (.NET 8 SDK) governs everything.
- `install.sh` no longer needs `(cd ./FadeBasic.Export.Web && …)` —
  publishes/packs directly.
- Consumer projects (e.g. `Test.csproj`) target net8.

## 7. NuGet packaging hygiene

`FadeBasic.Export.Web.csproj`:

- `PrivateAssets="all"` on every `PackageReference` and `ProjectReference`.
  Export.Web is a content-only package (`IncludeBuildOutput=false`);
  consumers don't compile or run any of its references — they just receive
  the WASM bundle and the targets file. Without `PrivateAssets`, NuGet
  advertised `FadeBasic.LSP.Core` etc. as transitive deps and restore
  failed because LSP.Core isn't published.

`FadeBasic.Lib.Web` stays a normal NuGet package consumed by user projects.

## 8. Small correctness fixes

- **Static field init order in `FadeBridge`.** `_workspace = CreateWorkspace("web")`
  was reading `_registeredSources` before it was initialized → NRE at type
  load. `_registeredSources` is now declared first; C# initializes statics
  in declaration order.

- **`LaunchUtil.UnpackDebugData("")`** threw `IndexOutOfRangeException`
  for Release builds that emit empty debug-data. Added an
  `IsNullOrEmpty` guard returning `new DebugData()`. Symmetric with
  `UnpackTestManifest`, which already had that guard.

- **`DescribeException` helper** in FadeBridge unwraps `InnerException`
  chains and stack traces. Under WASM trim, `ex.Message` collapses to
  resource keys like `Arg_TargetInvocationException` — the chain is the
  only thing that points at the real cause.

## State as of writing

- Test bundle from `Fade.Web.Test` builds, publishes, and runs end-to-end.
  `print` and `prompt$` both work in the browser.
- WASM bundle is large (no trim) but functional — explicit roots can be
  added later for size.
- The Playground still consumes the same `FadeBasic.Export.Web` publish
  output via `build:runtime`, so the editor + the exported game share the
  same runtime by construction.

## Likely follow-ups

- `TrimmerRootAssembly` / `TrimmerRootDescriptor` to re-enable trim with
  the right roots once the dynamic-load surface is locked.
- Confirm Playground's `commandDlls` flow lands user-uploaded DLLs through
  the same `RegisterCommandAssembly` path. Today it auto-loads
  `FadeBasic.Lib.Web` for web-type projects; user-uploaded DLLs not yet
  wired through the UI.
- MonoGame side of the export story (separate Fade.MonoGame repo).
- `fade-manifest.json` versioning if the export format evolves.
