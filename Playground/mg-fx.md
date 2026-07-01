# MonoGame Effects in the Browser — Status & Findings

Step 1 of the shader story from [mg.md](mg.md) Phase 3: validate that a desktop-built `.xnb` shader (no compile chain yet, just the existing OPFS upload path) can be loaded by KNI in the playground and used via fbasic's `effect` / `set screen effect` / `set effect param *` commands.

## Status

**Step 1 is fully confirmed.** Loading and visual rendering both work end-to-end on `ScreenEffect.xnb` after the in-memory MGFX binary patch (see §5 below). Step 2 (parse + re-emit MGFX byte-identically, enabling the in-browser shader compiler) is the next ladder rung.

## What works now

1. Drop `ScreenEffect.xnb` into OPFS at the workspace root.
2. `syncAssetsToRuntime()` ([main.ts:3563](src/main.ts#L3563)) walks the OPFS workspace, pipes each `.xnb` through `patchSoundEffectForKni` + `patchEffectMgfxVersionForKni`, and pushes bytes to BrowserContentManager via `monoGameHost.registerAsset(name, bytes)`.
3. fbasic `effect 1, "ScreenEffect"` calls `LoadEffect` in [RenderCommands.cs](../../Fade.MonoGame/Fade.MonoGame/Fade.MonoGame.Lib/RenderCommands.cs) — the browser branch is now implemented (previously a no-op `return`), mirroring the texture pattern in [TextureSystem.LoadTextureFromContent](../../Fade.MonoGame/Fade.MonoGame/Fade.MonoGame.Game/TextureSystem.cs).
4. `Content.Load<Effect>(name)` inside KNI's BlazorGL Effect ctor reads the patched MGFX bytes without rejecting them.

## Salient findings from the Step 1 work

### 1. `effect` was stubbed out on browser

[RenderCommands.cs:362-380](../../Fade.MonoGame/Fade.MonoGame/Fade.MonoGame.Lib/RenderCommands.cs#L362-L380) had a `#if BROWSER return; #endif` placeholder pointing at this very mg.md Phase 3. Symptoms before fixing:

- `effect 1, "X"` silently no-op'd → no effect ever loaded.
- `set screen effect 1` looked up an empty slot → effect didn't apply.
- `set effect param float 1, "X", v` NRE'd because `runtimeEffect.effect` was null.

### 2. `set effect param *` setters had no null-guard

Six setters in [RenderCommands.cs](../../Fade.MonoGame/Fade.MonoGame/Fade.MonoGame.Lib/RenderCommands.cs) called `runtimeEffect.effect.Parameters.ContainsParameter(...)` without checking the effect was loaded. Added `if (runtimeEffect.effect == null) return;` after each `GetEffectIndex` call (ColorInt, Float, Float2, Float3, Float4, Texture overloads).

### 3. MGFX version skew between desktop MGCB and KNI

- Desktop MGCB (currently shipping NuGet, MonoGame mainline) emits MGFX header `Version = 11`.
- KNI 4.2.9001 (pinned in [WebRuntime.MonoGame.csproj](../WebRuntime.MonoGame/WebRuntime.MonoGame.csproj)) reads `Version = 10`, throws **"This effect seems to be for a newer version of KNI."** on anything higher.
- Root cause: MonoGame PR [#8813](https://github.com/MonoGame/MonoGame/pull/8813) (commit `08677e96b`, "Better Runtime Shader Compiler Errors") — inserts two length-prefixed strings per shader record (`SourceFile`, `Entrypoint`) and bumps the version to 11. v10 readers run past EOF on the new record layout.

### 4. MGFX format detail (for future implementers)

EffectReader payload (objectData after the XNB envelope):

```
int32  dataSize             (length of MGFX blob)
'MGFX' magic (4)
byte   version              (10 or 11)
byte   profileId            (0=OpenGL, 1=DirectX_11, 3=Vulkan)
int32  effectKey            (content hash; written, ignored on read)
─── MGFX body ───
int32  cbufferCount
  ConstantBuffer × N {
    string name             (7-bit varint length + UTF-8)
    int16  sizeInBytes
    int32  paramCount
    (int32 paramIdx, uint16 offset) × paramCount
  }
int32  shaderCount
  Shader × N {
    bool   isVertexShader
    string SourceFile       ← v11 ONLY
    string Entrypoint       ← v11 ONLY
    int32  shaderLength
    bytes  shaderBytecode[shaderLength]
    byte   samplerCount
      Sampler × samplerCount {
        byte type, byte textureSlot, byte samplerSlot
        bool hasState
          [if hasState: 20 bytes — AddressU/V/W, BorderColor RGBA,
                                     Filter, MaxAnisotropy(int32),
                                     MaxMipLevel(int32), MipMapBias(float)]
        string name
        byte parameter
      }
    byte   cbufferRefCount
    byte × cbufferRefCount
    byte   attributeCount
      Attribute × attributeCount {
        string name
        byte usage, byte index
        int16 location
      }
  }
Parameters...
Techniques { ... passes { ... blend/depth/raster state blocks } }
'MGFX' tail (4)               (for read-validation)
```

Outside the MGFX blob, the XNB header has a `uint32 fileSize` at byte 6 that must match the total file length. Both `dataSize` and `fileSize` must be adjusted any time bytes are added/removed from the MGFX body.

### 5. The in-memory patcher

[`patchEffectMgfxVersionForKni`](src/xnb/xnb-previews.ts) — walks the v11 body, records each shader's `(SourceFile, Entrypoint)` byte range, splices them out, rewrites the version byte to 10, and patches both `dataSize` and XNB `fileSize`. Idempotent — bails when the input is already v10 or doesn't look like an MGFX effect. Mirrors the pattern of the existing `patchSoundEffectForKni`.

Tested against `ScreenEffect.xnb`:

```
Original length:  15593 bytes
Patched length:   15576 bytes  (17 bytes removed: "<unknown>" + "MainPS")
Version byte:     11 → 10
Body re-parses as valid v10:
  1 cbuffer "ps_uniforms_vec4" (32 B, 2 params)
  1 shader  (PS, 7500 B GLSL bytecode, 1 sampler "ps_s0")
```

### 6. Subtle: the MGFX header includes an `int32 EffectKey`

Easy to miss. The header is 10 bytes total: `magic(4) + version(1) + profile(1) + effectKey(4)`. The body starts at MGFX-blob offset 10, which is objectData offset 14 (after the EffectReader's dataSize prefix). Got this wrong on the first pass of the patcher and the body parse failed on garbage cbufferCount.

## Files touched in Step 1

- [RenderCommands.cs](../../Fade.MonoGame/Fade.MonoGame/Fade.MonoGame.Lib/RenderCommands.cs) — implemented `LoadEffect` browser branch; added null-guards to six `set effect param *` setters.
- [xnb-previews.ts](src/xnb/xnb-previews.ts) — new `patchEffectMgfxVersionForKni` (~120 lines including format walk).
- [main.ts](src/main.ts) — `syncAssetsToRuntime` chains the new patcher alongside the existing sound-effect patcher before `registerAsset`.

## What's NOT yet validated

- **Multi-shader effects (deferred).** ScreenEffect has one PS only. Effects with both VS + PS will exercise two shader records of splicing — deferred for now.
- **Multi-sampler effects.** ScreenEffect has the SpriteBatch-provided `SpriteTextureSampler` plus an `extern Texture2D Noise` set via the parameter API. The latter routes through `Effect.Parameters["Noise"].SetValue(texture)` — KNI's binding of that to a GL texture unit hasn't been tested.

## Next steps

In rough order of cheapness and dependency:

1. ~~**Eyeball ScreenEffect.**~~ ✓ Done — visual rendering confirmed.
2. ~~**Parameter round-trip probe.**~~ ✓ Done — `set effect param float` reaches GLSL uniform state correctly.
3. ~~**Test a VS+PS effect.**~~ Deferred — not a current priority.
4. ~~**Step 2 from mg.md Phase 3 plan**: parse + re-emit MGFX byte-identically.~~ ✓ Done — `roundTripXnb` (mgfx.ts) produces byte-identical output for `ScreenEffect.xnb` (v10, 15576 B, confirmed `firstInternalDiff=-1`). Working MGFX writer is ready; next rung is in-browser shader compilation via dxc-wasm + spirv-cross-wasm.
5. **Decide on the longer-term version-skew strategy.** Options: (a) keep the in-memory patcher indefinitely, (b) pin Fade's MGCB to a version that emits v10, (c) upgrade KNI to a release that accepts v11. (a) is fine for v1 since the bump is purely diagnostic metadata; (b)/(c) are cleanups.

## References

- [mg.md](mg.md) — overall MonoGame-in-the-browser plan; Phase 3 covers shaders & assets.
- [`EffectObject.writer.cs`](../../MonoGame/Tools/MonoGame.Effect.Compiler/Effect/EffectObject.writer.cs), [`Effect.cs`](../../MonoGame/MonoGame.Framework/Graphics/Effect/Effect.cs), [`Shader.cs`](../../MonoGame/MonoGame.Framework/Graphics/Shader/Shader.cs) — canonical MGFX writer/reader; MonoGame mainline.
- Commit `08677e96b` (MonoGame PR #8813) — the v10→v11 format change.
- KNI 4.2.9001 — pinned via `KniPlatformBlazorGLVersion` in [WebRuntime.MonoGame.csproj](../WebRuntime.MonoGame/WebRuntime.MonoGame.csproj).
