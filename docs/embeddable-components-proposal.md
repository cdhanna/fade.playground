# Proposal: Embeddable FadeBasic components

Turn this repo into the home of **(1) the Playground, (2) a reusable
embeddable component library, and (3) a sample project** — then consume
those components from `../dby/homepage` so the front page of
<https://fadebasic.com> shows a live, runnable (and debuggable) code
snippet.

Status: **draft for discussion**. Nothing here is built yet; this is the
plan and the ordered refactor.

---

## 1. Goal

- A visitor to fadebasic.com sees a code block with a **Run** button, an
  output pane, syntax highlighting, and real language intelligence
  (completion, hover, diagnostics) — plus **debug controls** (breakpoints
  + step/continue/stop).
- The same components power a future **Svelte-tutorial-style** progression
  (many small runnable snippets across steps).
- The Playground keeps working the entire time — we extract *by
  strangling*, never by a big-bang rewrite.

## 2. What we're extracting (grounded in the current code)

The valuable, reusable machinery is **not** the editor chrome — it's the
runtime protocol, and it already lives behind a clean boundary.

| Piece | Where it is today | Reuse |
|---|---|---|
| **Runtime protocol** — LSP + VM + debug, over `postMessage` | `FadeRunner` class, [Playground/src/main.ts:1756](../Playground/src/main.ts#L1756) | **High** — extract as a DOM-free client |
| **Language intelligence** — completion/hover/diagnostics/**semantic tokens** | worker `/runtime/web/worker.js`, role `lsp`; Monaco providers at [main.ts:3244–3475](../Playground/src/main.ts#L3244) | **High** — providers are thin adapters over the worker |
| **Syntax coloring (base)** — Monarch grammar | [Playground/src/languages.ts:346](../Playground/src/languages.ts#L346) | **High** — plain-Monaco feature, no workbench |
| **Execution + debug** — DAP-like protocol (`debug-start/continue/pause/step/set-breakpoints/stack-frames/scopes/eval/set-variable`) | `FadeRunner`, [main.ts:1913–2445](../Playground/src/main.ts#L1913); VM target is an **iframe** (`vmTarget = iframe.contentWindow`, [main.ts:1848](../Playground/src/main.ts#L1848)) | **High** — protocol is complete |
| **Editor shell** — full `@codingame/monaco-vscode-api` **workbench** | `initServices()` once, [main.ts:2801](../Playground/src/main.ts#L2801) | **Low** — singleton, one-per-page; *don't* reuse for embeds |
| **Output / panels UI** | DOM-ID functions (`appendOutputLine`, `#output`) in a 13k-line file | **Low** — re-implement small against the protocol |

Two facts drive every decision below:

1. **The runtime is already split across two transports** — an **LSP Web
   Worker** (language intelligence) and a **VM iframe** (execution +
   debug). Any embed needs both; the debug controls ride the VM iframe's
   existing protocol.
2. **The editor is a full VSCode workbench, initialized once per page.**
   You cannot place N of them on a tutorial page. So embeds use
   **standalone `monaco-editor`** (which still gets full highlighting +
   LSP, because those come from the worker/Monarch, *not* the workbench).

### Highlighting vs. LSP — why we ship both

- **Monarch** = client-side regex tokenizer. Colors keywords/strings/
  numbers. Knows *nothing* about commands. Tiny; lives in the JS.
- **LSP worker** = all command knowledge: completion lists, hover docs,
  signature help, "unknown command" diagnostics, and **semantic tokens**
  (`lsp-tokens` → `applySemanticTokens`, [main.ts:3141](../Playground/src/main.ts#L3141))
  — which is what actually colors a known command as a command. The
  command set is whatever assemblies are loaded into the worker
  (`load-assembly` / `register-command-assembly`).

The embed editor gets real command awareness because it talks to the same
worker the Playground does.

## 3. Target repo structure (npm workspaces monorepo)

```
Fade.Playground/                 ← workspaces root
├── packages/
│   ├── runtime/                 @fadebasic/runtime         (DOM-free client: LSP + VM + debug protocol)
│   ├── runtime-assets/          @fadebasic/runtime-assets  (worker.js + runtime.js + _framework/*.wasm, version-pinned)
│   ├── editor/                  @fadebasic/editor          (standalone Monaco + Monarch + LSP providers)
│   └── components/              @fadebasic/components       (<fade-runnable>, <fade-editor>; run + debug UI)
├── examples/
│   └── minimal-embed/           sample consumer (Vite) — reference + manual test bed
├── Playground/                  the full IDE (refactored to consume packages/*)
├── ghostBot/
└── oauth-proxy/
```

Then `../dby/homepage` (Svelte 5 + Vite → GitHub Pages) consumes
`@fadebasic/components` + `@fadebasic/runtime-assets`.

## 4. Package designs

### `@fadebasic/runtime-assets`
The heavy binaries, published as **files** (never inlined into a JS
bundle). Owns the existing staging pipeline
([scripts/build-runtime.mjs](../Playground/scripts/build-runtime.mjs),
[scripts/lib/sources.mjs](../Playground/scripts/lib/sources.mjs),
[runtime-versions.json](../Playground/runtime-versions.json)). Its build
stages the pinned NuGet web runtime into `dist/` (`worker.js`,
`runtime.js`, `web-commands.js`, `_framework/*`, precompressed `.br`/`.gz`).
Package version tracks the pinned runtime version.

Consumers **copy** this package's asset dir into their own static output
and serve it same-origin. (This is the onnxruntime-web / sql.js pattern.)

### `@fadebasic/runtime` — the DOM-free client
Extracted from `FadeRunner`. No Monaco, no DOM. Typed messages + events.

```ts
const rt = new FadeRuntime({ assetBase: '/fade/' }); // where runtime-assets are served

// Language service (spawns the LSP worker)
const lsp = await rt.language();
await lsp.setDocument(uri, text);
const items = await lsp.completion(uri, line, ch);
lsp.onDiagnostics(uri, diags => …);
const tokens = await lsp.semanticTokens(uri);

// Execution session (spawns the VM iframe; you provide/attach the frame)
const s = await rt.session({ projectType: 'web' });
s.onOutput(line => …);
await s.run(source);

// Debug — the DAP-like surface, already in the protocol
await s.debug.start(source);
await s.debug.setBreakpoints([{ line: 4 }]);
await s.debug.continue();
await s.debug.step('over' | 'into' | 'out');
s.debug.onEvent(e => { /* 'stopped' → read stackFrames/scopes */ });
const frames = await s.debug.stackFrames();
const scopes = await s.debug.scopes(frameId);
await s.debug.terminate();
```

### `@fadebasic/editor` — standalone Monaco + Fade language
```ts
attachFadeLanguage(monaco, rt);            // Monarch + LSP providers ← from main.ts:3244–3475
const editor = createFadeEditor(el, { runtime: rt, value, readonly });
```
Proves the light editor works outside the workbench. The Playground does
**not** have to adopt it — it's a new artifact for embeds.

### `@fadebasic/components` — web components (framework-agnostic)
```html
<!-- run + output -->
<fade-runnable asset-base="/fade/" project-type="web">
print "hello, fade"
</fade-runnable>

<!-- add breakpoints + debug toolbar + variables/callstack -->
<fade-runnable asset-base="/fade/" debug autorun readonly>
for i = 1 to 5 : print i : next i
</fade-runnable>
```
`<fade-runnable>` = `<fade-editor>` + Run button + output pane. Web
Components drop into Svelte, plain HTML, MDX — and there can be many per
page.

**Debug components (à la carte).** The `debug` attribute on `<fade-runnable>`
wires a sensible default arrangement, but each debug view is also its own
component you can place anywhere — this is the "not tabular" payoff: no
dockview, no fixed tab layout, compose what you want.

| Component | Backed by (`DebugAdapter`) |
|---|---|
| `<fade-debug-toolbar>` | continue / pause / step(over\|in\|out) / terminate |
| `<fade-variables>` | `scopes` + `expandVariable` |
| `<fade-watch>` | `eval` per expression |
| `<fade-call-stack>` | `stackFrames` |
| `<fade-breakpoints>` | `setBreakpoints` (list view) |
| `<fade-debug-console>` | `eval` / `repl` (the REPL) |

The **breakpoint gutter** is not a panel — it's a Monaco glyph-margin
decoration, so it lives on `<fade-editor>`/`<fade-runnable>`, plus a
current-line highlight driven by the `stopped` event.

**Two hard requirements (surfaced by the §10 litmus test):**

1. **Code as a *property*, not only slotted text.** Svelte (and JSX/MDX)
   parse `{` `}`; Fade source and markdown both contain braces. Generators
   must pass source as a string prop — `<fade-runnable code={src}>` — never
   as raw text between tags. Slotted text stays supported for hand-authored
   HTML, but `code=` is the safe path for generated pages.
2. **A read-only, highlight-only mode** — `<fade-editor readonly>` that
   colors via Monarch but skips the LSP, so display-only doc fragments
   don't show false "unknown symbol" squiggles.

*Scope tiers:* toolbar + variables + console cover "debug a snippet" (the
fadebasic.com front page). Watch / call-stack / breakpoints-list are a
full-tutorial-IDE need — ship them in a second wave.

**Reuse note — the debug logic is already factored.** [src/debug/](../Playground/src/debug/)
already contains a clean `DebugAdapter` interface ([adapter.ts](../Playground/src/debug/adapter.ts))
with `local`, `remote` (observe a peer over collab), and `facade`
implementations. That's the debug state machine + protocol driver, decoupled
from `main.ts` — it moves into `@fadebasic/runtime` essentially as-is. The
only real work is the **views**: they exist and are visually proven, but as
DOM-ID markup in `index.html` driven by `main.ts` render functions
(entangled with globals like `debugSessionActive`, collab hooks, dockview).
Rebuilding them as components = porting that render logic onto the adapter's
event stream. Mechanical view work, not protocol work.

## 5. Debugging in the embed — feasible, no blockers

The debug **protocol is complete** (see the table in §2) *and* the
adapter layer is already factored (see §4), so surfacing controls is UI
work, not protocol work. One thing to keep in mind:

1. **The VM runs in an iframe.** The embed must inject that iframe (it can
   be the visible output surface, or hidden for text-only programs).

**No cross-origin isolation required.** An earlier draft flagged a
`SharedArrayBuffer`/`Atomics.wait` fast-path (which would need COOP/COEP
headers that GitHub Pages can't set). That path was **removed** — see
[main.ts:1966](../Playground/src/main.ts#L1966): `interruptWait()` is now a
no-op, and in the cooperative-pump model `wait ms` is a `setTimeout` that
never blocks the worker thread, so pause / terminate / breakpoint changes
land via **plain `postMessage`** between pump ticks. Evidence: the live
Playground runs on a **vanilla Cloudflare Pages bucket with no COOP/COEP
headers** and full debug works. So run + output + LSP + debug all work on a
plain static host, GitHub Pages included. (The SAB/`Atomics` symbols that
remain in `dotnet.runtime.js`/`dotnet.native.js` are inert .NET emscripten
threading code, unused in single-threaded mode.)

## 6. Refactoring steps (strangler — Playground stays green throughout)

**Phase 0 — Monorepo scaffolding.** Convert the repo to npm workspaces;
add empty `packages/*` and `examples/*`; Playground becomes a workspace.
No behavior change. CI still builds/tests Playground.

**Phase 1 — `@fadebasic/runtime-assets`.** Move the runtime-staging
scripts + `runtime-versions.json` into the package. Playground consumes
assets from the package (copy step) instead of `public/runtime`. *Exit:
Playground runs identically.*

**Phase 2 — `@fadebasic/runtime`.** Extract `FadeRunner`'s transport +
protocol into a DOM-free `FadeRuntime`. Rewire Playground's `FadeRunner`
to wrap it (or replace it). *Exit: Playground has full parity (run, LSP,
debug, tests).*

**Phase 3 — `@fadebasic/editor`.** Extract Monarch registration
([languages.ts](../Playground/src/languages.ts)) + the Monaco LSP
providers ([main.ts:3244–3475](../Playground/src/main.ts#L3244)) into
`attachFadeLanguage` + `createFadeEditor` on **standalone** Monaco. Verify
in a throwaway harness that highlighting + completion + diagnostics render
without the workbench. *Exit: light editor demonstrably works.*

**Phase 4 — `@fadebasic/components`.** Build `<fade-editor>` and
`<fade-runnable>` (incl. the `debug` mode). Verify the SAB/COEP question
from §5 here. *Exit: run + debug work in a bare HTML page.*

**Phase 5 — `examples/minimal-embed`.** A tiny Vite consumer with the
runtime-assets copy step. Doubles as the reference for homepage and a
manual test bed.

**Phase 6 — Integrate into `../dby/homepage`.** See §7.

Phases 3–5 do not touch the Playground, so they can proceed in parallel
with normal Playground work once Phase 2 lands.

## 7. Integrating into `../dby/homepage`

`homepage/` is a **Svelte 5 + Vite SPA** deployed to **GitHub Pages** via
`dby/.github/workflows/main.yml` (uploads `homepage/dist`). Custom domain
fadebasic.com ⇒ **single static origin** — perfect for same-origin,
zero-CORS asset hosting.

1. Add deps: `@fadebasic/components`, `@fadebasic/runtime-assets` (link via
   workspace/`npm pack`/`file:` during dev; publish to npm for release).
2. Copy runtime-assets into `homepage/public/fade/` at build
   (`vite-plugin-static-copy` or a prebuild script) so Pages serves them at
   `fadebasic.com/fade/`.
3. In `homepage/src/App.svelte`:
   ```svelte
   <script>import '@fadebasic/components';</script>
   <fade-runnable asset-base="/fade/" debug>
   print "welcome to fade"
   </fade-runnable>
   ```
4. **Base-path gotcha:** `homepage/vite.config.js` sets
   `base: 'https://fadebasic.com'`. Make `asset-base` a root-absolute
   path (`/fade/`) or a full URL, and confirm the worker/wasm fetch URLs
   resolve correctly under that base.

Because everything is served from fadebasic.com itself: no CORS, `new
Worker()` is same-origin, and Blazor's credentialed `_framework` fetches
just work.

## 8. Risks & open questions

- ~~SAB/COEP on GitHub Pages~~ — **resolved, not a risk.** The SAB
  interrupt path was removed; debug rides plain postMessage and the live
  vanilla-Cloudflare deploy proves no cross-origin isolation is needed
  (§5).
- **Bundle weight** — the .NET web runtime is ~10–15 MB brotli, cached
  after first load. Lazy-load it on first *Run* so it never blocks paint.
- **Install weight** — keeping `-assets` a *separate* package means
  type-only/SSR/test consumers don't pull binaries.
- **`FadeRunner` de-DOM-ing** — it currently reaches into DOM/globals in
  places (`window.__fade*`, breakpoint gutter). Phase 2 must sever those;
  budget for it being the fiddliest phase.
- **Two runtimes** — MonoGame is a separate, heavier iframe runtime. Scope
  the first components to the **web** runtime; add a `<fade-game>` later.
- **Versioning** — components, runtime client, and runtime-assets should
  share a coordinated version tied to the pinned NuGet runtime.

## 9. Suggested first PR

Phase 0 + Phase 1: stand up workspaces and carve out
`@fadebasic/runtime-assets`, with the Playground consuming it. Lowest
risk, unblocks everything, and proves the monorepo plumbing before we
touch any hot code in `main.ts`.

## 10. Litmus test — interactive `Language.md` at fadebasic.com/#/help

The success criterion for the whole effort: a route on the homepage that
renders [`dby/FadeBasic/book/FadeBook/Language.md`](../../dby/FadeBasic/book/FadeBook/Language.md)
(2180 lines, 148 ` ```basic ` blocks) with the code snippets turned
interactive via the components. If this works, the library is real.

**Runnability is opt-in — this is the make-or-break design choice.** Most
` ```basic ` blocks are *teaching fragments*, not standalone programs:
declarations with no output (`x = 27`), intentionally-invalid examples
(`message$ = 27` — the doc *wants* it wrong), and context-dependent
snippets (`x = add(1,2)` references `add` from a prior block). Auto-running
all of them yields a page of no-ops and false errors. So use the markdown
fence info string:

| Fence | Renders as |
|---|---|
| ` ```basic ` | `<fade-editor readonly>` — highlighted, no Run, no LSP |
| ` ```basic run ` | `<fade-runnable>` — Run + output; author curates these self-contained |
| ` ```basic run invalid ` | runnable **with** LSP on, so the wrong example shows its squiggle |

Only the ~20–40 examples worth running get annotated; the rest still look
polished (highlighted). `Language.md` is authored in-repo, so this is cheap.

**Generator (`fade-md-to-svelte`)** — lives in *this* repo (generic tooling,
reused later by the tutorial platform); its input `Language.md` lives beside
`homepage` in `dby`, so in the dby build it's a sibling path, not a
cross-repo fetch. Output stays boring and safe:

```
Language.md ──▶ src/generated/help-content.js   (ordered [{prose html} | {code, mode}])
                Help.svelte (hand-written, stable) imports it:
                   prose → {@html block.html}          (via marked)
                   code  → <fade-runnable code={block.code}/>  |  <fade-editor readonly code=…/>
```

Emitting a **data module + one hand-written `Help.svelte`** (not raw
`.svelte` markup) dodges Svelte brace-escaping and keeps component logic
hand-versioned. The `basic` fence tag maps to the component's internal
`fade` language.

**Routing** — `homepage` has no router. Use a **hash route**
(`fadebasic.com/#/help`) via a small `App.svelte` conditional (or
`svelte-spa-router`) — simplest and GH-Pages-safe. For a clean `/help` URL,
add a second Vite entry (`help.html`); also static.

**npm wiring** — `file:`/workspace link to `../../Fade.Playground/packages/*`
during dev; the dby release workflow installs published `@fadebasic/*` from
npm. Prebuild copies `runtime-assets` → `homepage/public/fade/` and runs
`fade-md-to-svelte` before `vite build`.

**New work this adds** beyond Phases 0–6: the `fade-md-to-svelte` generator
(small), the `readonly`/`code`-prop component requirements (§4), and the
homepage route + prebuild wiring. It slots in as the concrete deliverable of
Phases 5–6.
</content>
