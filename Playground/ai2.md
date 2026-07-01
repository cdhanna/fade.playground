# Playground AI Assistant — Holistic Rewrite Plan

The current `ai-chat.ts` is a single 1163-line file built around WebLLM with
3 file tools and a thin agent loop. It works as a demo but won't scale to a
useful coding agent: WebLLM's prebuilt models are capped at 4K context, its
native tool-calling API only works for 5 Hermes model IDs, and there's no
retrieval so docs can't be brought in without burning the budget.

The rewrite swaps WebLLM for `@huggingface/transformers` as the default
runtime — same library we already need for RAG embeddings, with no
artificial context cap and a model catalog that scales with HuggingFace.
WebLLM stays around as an alternate provider behind the new abstraction
layer, useful for users with already-cached weights or as a performance
benchmark.

This document describes the target system.

## Goals

- **Local-first.** A user with no network and no API key should still get a
  usable assistant. The default browser runtime is
  [`@huggingface/transformers`](https://huggingface.co/docs/transformers.js)
  with WebGPU acceleration — same library we already need for RAG embeddings.
- **Structured for swappable backends.** All agent logic talks to a
  `ChatProvider` interface. Transformers.js is the v1 default;
  WebLLM, wllama, Ollama, and hosted APIs are alternate implementations.
- **Richer agent loop.** Planning, multi-step tool use, real context
  management. Not just `while (toolCalls) { runTools }`.
- **Docs in context via RAG**, not stuffing. Configurable doc paths so FadeBook
  today and the Monogame command docs later both feed the same pipeline.

## Provider landscape

Before picking a model we need to pick a runtime. The four candidates we
evaluated:

| Runtime           | Browser-only | GPU | Context | Tool calling | Notes |
|-------------------|:------------:|:---:|---------|--------------|-------|
| **transformers.js** | ✅ | WebGPU + WASM | model-native (32K for Qwen Coder) | yes, any compatible model | Same lib we need for RAG. Default. |
| WebLLM            | ✅ | WebGPU | hard 4K cap on all prebuilts | only 5 Hermes IDs | Fast, but ceiling is dealbreaker. |
| wllama            | ✅ | WASM (CPU) | model-native via GGUF | yes | Best for Safari / no-WebGPU. 2GB file limit. |
| Ollama            | ❌ (local server) | native | model-native | yes (OpenAI-compatible API) | Power-user mode; auto-detect `localhost:11434`. |

### Why transformers.js as the default

- **Shared infrastructure with RAG.** The bge-small-en-v1.5 embedder runs
  on the same library. One dependency, one IndexedDB cache, one model-load
  flow instead of WebLLM + transformers.js side-by-side.
- **No artificial context cap.** Models expose their native window
  (Qwen 2.5 Coder = 32K). This loosens every other constraint in the
  system: RAG can retrieve more, summarization fires less aggressively,
  the agent loop can hold more tool results in scrollback.
- **No tool-calling allow-list.** WebLLM rejects `tools` for any model
  outside its 5 Hermes IDs (verified against
  [`functionCallingModelIds`](node_modules/@mlc-ai/web-llm/lib/index.js) in
  the installed package). Transformers.js has no such allow-list — we
  drive tool calls through an in-prompt protocol and parse the output,
  which works on any instruction-tuned model.
- **Catalog scales with HF.** New ONNX conversions appear weekly under
  `onnx-community/*` and `Xenova/*`. No waiting on MLC to compile a custom
  WASM for each model.

**The honest cost: speed.** WebLLM's hand-tuned MLC kernels are faster per
token than ONNX Runtime Web. For a 1.5B model with WebGPU enabled,
transformers.js is "interactive but you notice it." For 7B, the gap is
more noticeable. We accept the cost because every other axis is better.

### Why WebLLM stays around (alternate provider)

- Faster per-token throughput on the same model.
- Already in users' caches (4–6 GB Hermes downloads from the existing
  Playground sessions).
- Useful as a benchmark sanity check while the rewrite stabilizes.

It moves from "primary runtime" to "second-class alternative", reachable
from the Models tab with a clear UX note about the 4K context limit.

### Models available, ranked for our use

The primary target on transformers.js:

- **`onnx-community/Qwen2.5-Coder-1.5B-Instruct`** — confirmed available
  as ONNX with `dtype: 'q4'` quantization. ~1 GB download. Native 32K
  context. Strong on code given few-shot examples. **Default for new
  users.**
- **`onnx-community/Qwen2.5-Coder-7B-Instruct`** (when available; check at
  build time) — larger, slower, smarter. **Power-user option for capable
  GPUs.**
- **`onnx-community/Phi-3.5-mini-instruct`** — 3.8B, broad generalist,
  native 128K context. Useful when docs need to dominate the prompt.
- **`onnx-community/Llama-3.2-3B-Instruct`** — solid fallback, native
  128K context.

WebLLM-only models (for users who explicitly opt into that provider):

- **Hermes-3-Llama-3.1-8B (q4f16_1)** — only WebLLM model with native
  tool-calling. Useful only as a comparison baseline.
- **Qwen2.5-Coder-7B (WebLLM build)** — fast but capped at 4K. Worse on
  every axis except throughput.

**Drop from the existing in-app list:** Hermes-2-Pro 8B, plain Llama 3.1
8B, plain Qwen 2.5 3B (non-Coder). All superseded.

### Token budget (revised for transformers.js + Qwen Coder)

With a native 32K window the budget is comfortable rather than cramped:

| Slot                              | Tokens |
|-----------------------------------|--------|
| System prompt + few-shot examples | ~800   |
| Workspace state block             | ~200   |
| RAG top-5 chunks (~400 each)      | ~2000  |
| Conversation history (rolling)    | ~4000  |
| Recent tool results               | ~2000  |
| Plan + response generation        | ~2000  |
| Slack / safety                    | ~1000  |
| **Working total**                 | **~12000** |
| **Remaining headroom (of 32K)**   | **~20000** |

Summarization and eviction still get built — they're the pressure valve
for long debugging sessions and large file reads — but they're a
correctness measure, not a tight-loop fight against the budget.

## Tool-calling strategy

The default path on transformers.js is **in-prompt tool calling** — we
define a structured text protocol the model emits and parse it ourselves.
This works on any instruction-tuned model (Qwen, Phi, Llama, etc.) without
depending on framework-specific function-calling APIs.

### The protocol

**Prompt addendum (compact, ~300 tokens):**

```
You can call tools by emitting exactly one tool call per turn in this format:

<tool_call>
{"name": "read_file", "args": {"path": "main.fade"}}
</tool_call>

Available tools:
- read_file(path: string) — read a workspace file
- search_docs(query: string) — search FadeBasic docs
- apply_edit(path, startLine, endLine, newText)
- ...

Wait for the tool result (delivered as <tool_result>...</tool_result>) before
emitting the next action. When done, reply normally without a <tool_call>.
```

**Parser:** Stream the model's output, extract `<tool_call>...</tool_call>`
blocks via regex, JSON-parse the contents, validate against the Zod schema
for that tool. On parse failure, return the validation error as a
`<tool_result>` in the next turn — the model self-corrects in most cases.

**Why this format:** Qwen 2.5 Coder, Phi-3.5, and Llama 3.2 are all trained
on tool-calling data and understand structured invocation. The
`<tool_call>` tag is close enough to Qwen's upstream template that the
model "just gets it" with a few-shot example, and generic enough that
swapping in Phi or Llama Just Works.

### Per-provider specializations

Each `ChatProvider` may override the in-prompt default if its underlying
model has a native function-calling path that's more reliable:

- **`TransformersJSProvider`** — in-prompt protocol. Default for v1.
- **`WebLLMProvider`** — in-prompt protocol for most models, *native*
  `tools` API only when the loaded model ID matches WebLLM's allow-list
  (Hermes-3 8B etc.). Retain the existing `ToolCallOutputParseError`
  workaround at [ai-chat.ts:876-883](src/ai-chat.ts#L876-L883) for that
  path.
- **`OllamaProvider`** (future) — native OpenAI-compatible `tools` API.
- **`HostedProvider`** (future) — provider-native tools (Anthropic /
  OpenAI).

### Unified stream event interface

The `ChatProvider.stream()` interface returns a unified `StreamEvent` type
regardless of which path the underlying provider used:

```ts
type StreamEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'tool_call'; id: string; name: string; args: unknown }
  | { kind: 'done'; finishReason: 'stop' | 'tool_calls' | 'length' | 'error' };
```

The agent loop never knows whether the tool call came from a native API or
from our regex over the model's output. Tests run identically against
every provider.

## RAG — retrieval-augmented generation

Instead of stuffing all docs into the prompt, retrieve only the few paragraphs
relevant to the current question.

### Pipeline

**Build time, once per docs change:**

1. Walk configured doc roots (`FadeBasic/book/FadeBook/*.md` today, Monogame
   command docs later — a config array of glob patterns).
2. Split each file into ~300-token chunks. Heading-aware: `## Section`
   boundaries are natural splits.
3. For each chunk, run it through a small embedding model that turns text into
   a ~384-dim float vector. Two chunks about "sprite rotation" end up with
   similar vectors; a chunk about "file I/O" points somewhere different.
4. Write chunks + vectors to `public/docs-index.json` (1–5 MB total).

**Runtime, on each query:**

1. Embed the user's message with **the same model** (non-negotiable — different
   embedders produce incompatible vector spaces).
2. Cosine similarity between the question vector and every chunk vector. Sort,
   take top 3–5.
3. Inject those chunks into the prompt as a `Relevant docs:` block.

The math is unglamorous: dot product on 384-dim vectors across a few hundred
chunks runs in single-digit milliseconds. No vector database needed.

### Client-side pieces

- **Embedder:** [transformers.js](https://huggingface.co/docs/transformers.js)
  with `Xenova/bge-small-en-v1.5` (~30MB, 384-dim, English, ONNX). Loads from
  CDN, caches in IndexedDB after first run. **Important:** BGE models require
  asymmetric prefixes — embed queries with `"query: "` prepended and chunks
  with `"passage: "` prepended. Skipping this measurably degrades retrieval
  quality. Mismatched prefixes are a classic silent-failure mode; bake it
  into the embedder wrapper so callers can't forget. Use `dtype: 'q4f16'`
  for WebGPU-quantized inference when available, fall back to default ONNX
  on CPU.
- **Indexer:** a build script (sibling to `scripts/build-runtime.mjs`) that
  reads configured paths, chunks, embeds, writes the JSON.
- **Runtime search:** flat array + for-loop. Replace with HNSW or similar only
  if we hit ~50k chunks.

### Wiring into the agent

Two paths, both shipped:

- **Auto-retrieval on first turn.** Embed the user message, pull top 3 chunks,
  prepend to the system prompt. Safety net — small models often won't
  proactively call a search tool.
- **`search_docs` as an explicit tool.** Lets the model fetch more context
  mid-conversation if needed. Qwen Coder will use it; smaller models may not.
  That's fine — auto-retrieval covers them.

## The agent loop

Three phases, not one continuous stream:

1. **Plan.** Model emits structured JSON: `{ goal, steps: [{ tool, why }] }`.
   Rendered in a side panel so the user sees the plan before anything runs.
   Small models reason better when they think first; users trust agents more
   when the plan is visible. Streaming the plan JSON token-by-token keeps
   things feeling responsive.
2. **Execute.** Iterate tools as today, ticking off each step in the plan UI.
3. **Summarize.** Final natural-language answer referencing what was done.

Optional but valuable: a "Looks good, run it" button between plan and execute.
The single biggest trust-builder in agentic UIs.

## Tool surface

The current 3 tools are the floor. Target set:

- **`search_docs`** — RAG retrieval.
- **`read_file` / `list_files`** — keep.
- **`apply_edit`** — *range-based*, not whole-file rewrites.
  `{ path, startLine, endLine, newText }`. Tiny models cannot reliably
  re-emit a 500-line file. They *can* emit "replace lines 42-58 with this."
  Use Monaco's edit primitives. This single change unlocks accurate edits on
  small models.
- **`create_file`** — separate from edits.
- **`get_diagnostics`** — LSP errors/warnings for a file. Closes the
  write-then-check loop without needing to execute anything.
- **`get_editor_context`** — current file, cursor position, selection,
  visible range. Lets the user say "fix this" with no further explanation.
- **`read_fade_config`** — surface `fade.json` so the agent understands
  project structure.

> Note: there is no `run_fade` tool. Executing the user's program from the
> agent isn't on the table for this rewrite. The loop is "write → check
> diagnostics → fix," not "write → run → fix." `get_diagnostics` is the
> primary feedback signal.

Drop `write_file` entirely — strictly worse than `apply_edit` + `create_file`.

**Tool registry as a typed module**, not three switch cases. Each tool exports
`{ name, schema, description, execute }`. Adding a tool is one file, no
agent-loop changes. Use Zod (or equivalent) so the TS type AND the JSON schema
sent to the model are derived from one source — kills the "model sent garbage
args, code crashed" class of bugs.

## Context management

Without this, every long conversation eventually wedges.

- **Real `countTokens()`** per provider. A visible token meter in the UI.
- **Budget tracker.** When usage exceeds ~60% of context, trigger eviction.
- **Eviction strategies, in order:** drop old tool-result bodies (keep the
  call record, drop the payload) → summarize old turns → drop the oldest user
  turn entirely.
- **Conversation summarization.** When the rolling window exceeds threshold,
  fold the older half into a "Summary so far" system message. Small models do
  this passably with a tight prompt: "Summarize what was decided, what files
  were touched, what's still open. Under 200 words."

## Workspace integration

- **Auto-context block.** Replace the current `[Workspace: project=... files=...]`
  string hack with a structured workspace-state system message regenerated
  each turn: current project, open file, cursor line, last diagnostic count.
- **Per-project memory.** A `.fade/assistant.md` file the agent reads on first
  turn of each chat and can append to ("user prefers tabs over spaces", "this
  project uses the sprite pool pattern"). Equivalent of CLAUDE.md, scoped per
  project.
## Slash commands — system-level introspection

Slash commands are reserved for **inspecting and controlling the assistant
itself**, not as shortcuts to prompt the model. They run client-side and never
hit the LLM. The point is to let the user see what the agent sees, debug
weirdness, and reach the controls without diving into a settings menu.

The intended set:

- **`/context`** — dump the current context window: token usage vs. budget,
  the workspace-state block, the retrieved RAG chunks for the last turn, the
  active per-project memory entries.
- **`/tools`** — list every registered tool with its description and JSON
  schema. Useful when you suspect the model isn't seeing a tool you expect.
- **`/model`** — show the active model, its capabilities (`supportsTools`,
  `maxContext`), provider name, and recent latency/throughput.
- **`/memory`** — show the contents of `.fade/assistant.md` and let the user
  edit / clear it inline.
- **`/plan`** — re-display the last plan emitted by the agent. Handy when the
  plan panel has scrolled away.
- **`/logs`** — focus the Logs panel and apply a filter to AI channels.
- **`/help`** — list available slash commands.
- **`/clear`** — clear the conversation (mirrors the existing button).

None of these are prompt templates. Each is a deterministic render of state
the assistant already tracks. Adding one is a small registry entry, not a
prompt-engineering exercise.

## Logs integration

The Playground already has a structured log bus (`src/log-bus.ts`) and a Logs
panel (`src/logs-panel.ts`) with channel + level filtering, snapshots, and
live tail. The current AI code ignores this and scatters
`console.log('[fade/ai] ...')` calls throughout `ai-chat.ts`. The rewrite
should route everything through the existing bus.

### Channel layout

Split AI logs across several channels so the user can filter to what they
care about:

- **`ai/provider`** — model load progress, provider errors, stream lifecycle
  (`stream start`, `stream done — finish_reason=stop tokens=412`).
- **`ai/agent`** — high-level loop events: iteration start, plan emitted,
  tool round dispatched, summarization triggered, max-iterations hit.
- **`ai/tool`** — every tool call: name, args (truncated), result size,
  duration, success/failure. One log entry on dispatch, one on completion.
- **`ai/rag`** — retrieval lifecycle: embedder load, index load, query
  embedded, top-K results with similarity scores.
- **`ai/context`** — budget tracker activity: token counts per turn, when
  eviction kicks in, when summarization runs.

Each channel gets its own `Logger` via `getLogger('ai/agent')` etc. — no
new infrastructure needed.

### Log level conventions

- `debug` — verbose flow (every chunk streamed, every similarity score).
  Off by default but available when something goes wrong.
- `info` — normal milestones (model loaded, tool called, plan generated).
- `warn` — recoverable issues (parser fallback fired, retried without tools,
  context approaching budget).
- `error` — failures the user should know about (model load failed, tool
  threw, abort).

### Cross-references between chat and logs

- **`/logs` slash command** focuses the Logs panel and applies an
  `ai/*` channel filter so the user lands on the relevant entries.
- **Tool rows in the chat UI** get a small "view in logs" affordance that
  jumps to the corresponding log entry (matched by a per-call correlation
  ID stamped into both the chat row and the log message).
- **Errors surfaced in chat** include the channel name so the user knows
  where to look for the full trace.

### Don't double up

Once logs are wired:

- Drop the `console.log('[fade/ai] ...')` calls. The Logs panel is the
  source of truth.
- The chat panel's inline tool rows stay — they're the user-facing summary.
  Logs are the underlying detail.
- Progress events (model download %) stay on the existing `progressListeners`
  system for the chat panel's progress bar, but also emit at `debug` to
  `ai/provider` so the full timeline is recoverable.

## System prompt strategy

Small models follow examples 10× better than they follow instructions.

- Hand-write 2–3 short example exchanges (user question → plan → tool call →
  final answer) and ship them as the first messages. Costs ~500 tokens,
  dramatically improves behavior.
- Keep the instructional system prompt terse. The examples do the heavy
  lifting.

## File layout

Today: 1163-line `ai-chat.ts` mixing UI, tools, agent loop, persistence, diff
rendering. Split:

```
src/ai/
  providers/
    types.ts                  ChatProvider interface, StreamEvent union
    transformers-js.ts        primary v1 impl, runs LLM via @huggingface/transformers
    webllm.ts                 alternate impl, kept for users with cached models
    mock.ts                   scripted provider for tests
    index.ts                  registry, default selection logic
  agent.ts                    the loop: plan / execute / summarize
  tools/
    index.ts                  registry
    apply-edit.ts
    create-file.ts
    search-docs.ts
    read-file.ts
    list-files.ts
    get-diagnostics.ts
    get-editor-context.ts
    read-fade-config.ts
  rag/
    embedder.ts               @huggingface/transformers wrapper (bge-small),
                              shared model-load infra with the LLM provider
    index-loader.ts           load docs-index.json
    search.ts                 cosine-similarity top-K
  tool-protocol.ts            <tool_call> / <tool_result> parser + emitter
  context.ts                  workspace state block, summarization, eviction
  store.ts                    chat persistence (current ChatStore)
  ui/
    chat-panel.ts
    models-panel.ts
    plan-panel.ts
    diff-approval.ts
scripts/
  build-docs-index.mjs        indexer, runs on predev/prebuild
```

## Provider abstraction

The agent loop talks to a `ChatProvider` interface, never to a concrete
runtime. The default v1 implementation is `TransformersJSProvider`.

```ts
interface ChatProvider {
  /** Stable identifier for telemetry / persistence (e.g. "transformers-js"). */
  readonly id: string;

  /** Human-readable label shown in the Models tab. */
  readonly label: string;

  /** Cheap, conservative token count — usually a tokenizer.encode call. */
  countTokens(text: string): number;

  /** Stream a completion. Tools are passed in if `capabilities.supportsTools`;
   *  otherwise the agent injects the in-prompt protocol itself. */
  stream(opts: {
    messages: Msg[];
    tools?: Tool[];
    signal?: AbortSignal;
  }): AsyncIterable<StreamEvent>;

  /** Idempotent. Loads weights (with progress events on the bus) if needed. */
  ensureReady(): Promise<void>;

  readonly capabilities: {
    /** True if the runtime has a native tools API. Otherwise the agent uses
     *  the in-prompt <tool_call> protocol and parses output itself. */
    supportsTools: boolean;
    /** Native context window for the loaded model. */
    maxContext: number;
    /** Whether weights live in IndexedDB / OPFS already. */
    isCached: boolean;
  };
}
```

### Implementations

- **`TransformersJSProvider`** — **v1 default.** Wraps
  `@huggingface/transformers` text-generation pipeline. Uses the same
  underlying library as the RAG embedder (one cache, one IndexedDB
  namespace, one progress UX). Tool calls go through the in-prompt
  protocol. `capabilities.maxContext` reads from the loaded model's config
  (e.g. 32K for Qwen 2.5 Coder).
- **`WebLLMProvider`** — alternate, kept for users with already-downloaded
  Hermes weights and as a perf comparison point. Reports `maxContext: 4096`
  honestly. Uses native tools API only when the loaded model matches the
  allow-list, otherwise falls through to in-prompt.
- **`MockProvider`** — built alongside the v1 default, not after. Scripted
  `StreamEvent` sequences for deterministic tests. See "Designing for
  testability" below.
- **`OllamaProvider`** (future) — auto-detects `localhost:11434`. When
  present, becomes a selectable provider in the Models tab with the
  caveat "requires Ollama running locally."
- **`HostedProvider`** (future) — Anthropic / OpenAI. Same interface,
  uses native tools API.

### Default selection

On first launch (`providers/index.ts`):

1. If WebGPU is available → default to `TransformersJSProvider` with
   `onnx-community/Qwen2.5-Coder-1.5B-Instruct`.
2. If WebGPU is missing but `localhost:11434` responds → propose
   `OllamaProvider` (future).
3. Otherwise → `TransformersJSProvider` with WASM backend and a clear
   "this will be slow" notice.

The current Models tab UI surfaces all available providers + their
capabilities; the user can override default selection at any time.

## Designing for testability

LLM features are notoriously hard to test, mostly because people try to test
the model. **We don't test the model. We test the system around it.** Get the
seams right up front and most of the system becomes ordinary code with
ordinary unit tests.

### The big idea: testable seams

Every layer of the system has exactly one piece that touches non-determinism
(the model) and everything else is pure logic over plain data. The seams:

- **`ChatProvider` interface** — only real-model providers
  (`TransformersJSProvider`, `WebLLMProvider`) are non-deterministic.
  Everything else in the agent loop sees an `AsyncIterable<StreamEvent>` and
  doesn't care where it came from.
- **`WorkspaceAdapter` interface** — already exists. The rewrite gets an
  `InMemoryWorkspace` test impl alongside the production OPFS one.
- **`Embedder` interface** — production uses transformers.js; tests use a
  deterministic stub that returns hashed-text vectors. Same shape, same
  cosine-similarity math, no 30MB download.
- **`Clock` injection** — anything timing-related (token-per-second
  measurements, summarization triggers) reads from an injected clock.
  Tests pass a fake clock, real code passes `Date.now`.

If any seam leaks (a tool imports the live workspace directly, the agent
hard-codes a concrete provider), testing gets exponentially harder. Worth
enforcing in review.

### Test pyramid

**1. Pure-function unit tests (the floor — 80% of tests live here):**

- RAG: `chunkMarkdown(text)` → chunks. `cosine(a, b)` → number.
  `topK(query, chunks, k)` → results. Zero I/O, fast, exhaustive.
- Context: `buildWorkspaceBlock(state)` → string. `shouldEvict(budget)` →
  boolean. `summarizePrompt(history)` → messages.
- Tool schemas: every tool's Zod schema gets a "rejects bad args, accepts
  good args" battery.
- Plan parsing: the model emits JSON; `parsePlan(raw)` → `Plan | Error`.
  Test against hand-written valid and malformed examples.

**2. Agent-loop tests with `MockProvider` (the workhorse):**

The `MockProvider` is the single most important piece of test infrastructure.
It takes a *script* — a list of stream events to emit in response to the Nth
message — and replays them deterministically.

```ts
const provider = new MockProvider([
  // First model turn: emit a plan
  { kind: 'text', text: '{"goal":"read foo.fade","steps":[...]}' },
  { kind: 'done', finishReason: 'stop' },
  // Second turn: call read_file
  { kind: 'tool_call', name: 'read_file', args: { path: 'foo.fade' } },
  { kind: 'done', finishReason: 'tool_calls' },
  // Third turn: respond
  { kind: 'text', text: 'foo.fade defines a sprite at 100,200.' },
  { kind: 'done', finishReason: 'stop' },
]);
```

Tests then assert on:

- Tool calls made (names, args, order).
- Messages assembled and sent to the provider on each iteration.
- Final conversation state.
- Termination reason (`stop`, `max_iterations`, `error`).

**3. Scenario tests (data-driven regression suite):**

`tests/agent/scenarios/*.json` — each file is a self-contained scenario:

```json
{
  "name": "fix-diagnostic-on-current-file",
  "workspace": { "main.fade": "..." },
  "editor": { "openFile": "main.fade", "cursor": [42, 0] },
  "diagnostics": { "main.fade": [{ "line": 42, "msg": "Undefined: sprit" }] },
  "userMessage": "/fix",
  "providerScript": [...],
  "expect": {
    "toolsCalled": ["get_diagnostics", "apply_edit"],
    "finalWorkspace": { "main.fade": "<expected content>" }
  }
}
```

Adding a regression test for a bug is *dropping a JSON file*, not writing
TypeScript. This is the difference between "we should add a test" and
"a test got added."

**4. Snapshot tests on assembled prompts:**

Before each call to the provider, the agent builds a final `messages[]`
array — system prompt, few-shot examples, summary, retrieved chunks,
workspace block, history. Snapshot that array. When the prompt changes
unintentionally (somebody edits the system template, the workspace block
gains a field), the diff makes it impossible to miss.

**5. Playwright E2E against `MockProvider`:**

The full UI driven by Playwright, running against `MockProvider`. Verifies
the chat panel, plan panel, diff approval, slash commands, and Logs panel
integration end-to-end. No real model, no GPU, no flake. Runs in CI.

**6. Manual smoke against real providers:**

A small set of "golden path" scenarios run manually before a release,
against `TransformersJSProvider` with the default Qwen Coder model. This
catches model-specific issues (Qwen handled the tool call but Phi didn't)
that no amount of mocking will find. Re-run against `WebLLMProvider` only
when changes affect that code path.

### Record-and-replay

For the few tests where we *want* to verify against a real model's behavior
without paying the cost every CI run: add a `RecordingProvider` that wraps
any concrete provider, captures every stream event to a JSON fixture, and a
`ReplayProvider` that reads those fixtures back.

Workflow: run a scenario once locally with `RECORD=1`, commit the fixture.
CI replays. When a model is swapped, regenerate fixtures. This is VCR for
LLM responses — the same pattern Ruby's `vcr` gem and Python's `vcrpy` use
for HTTP, applied to the provider stream.

### Logs and events as test oracles

Because the AI subsystem already emits structured events through `appLog`
(see Logs integration), tests get a free assertion target: subscribe to the
bus and assert on the log sequence.

```ts
const logs = recordLogs(appLog, { channel: /^ai\// });
await agent.send('hello');
expect(logs.byChannel('ai/agent')).toMatchPattern([
  { msg: /plan emitted/, level: 'info' },
  { msg: /iteration 1/, level: 'info' },
  { msg: /loop complete/, level: 'info' },
]);
```

The events already exist for the user-facing Logs panel; tests get them
for free. No "add logging to make this testable" follow-up tickets.

### Determinism rules

A few discipline points the architecture has to enforce:

- **No `Math.random()` or `Date.now()` outside the `Clock` and `IDProvider`
  abstractions.** Chat IDs, correlation IDs, jitter — all go through
  injectable sources.
- **No filesystem or network from tools.** Tools take `WorkspaceAdapter`
  and similar interfaces; the production wiring binds them to the real
  thing, tests bind them to in-memory fakes.
- **Streams are testable.** The `MockProvider` exposes a way to construct
  a stream from a list of events. Sleeps/delays inside streams are driven
  by the injected clock, not real `setTimeout`.

### What this looks like in CI

- Vitest runs the pure-function suite, the scenario suite, and the snapshot
  suite. Target: under 10 seconds for the whole AI test pass.
- Playwright runs the E2E suite against `MockProvider`. Target: under
  30 seconds.
- Replay tests run against `ReplayProvider` with committed fixtures. No
  network, no model.
- A separate `npm run test:ai:smoke` task runs the golden-path scenarios
  against `TransformersJSProvider` (and optionally `WebLLMProvider`) on a
  developer machine. Not in CI.

### What we *don't* test automatically

- "Does the model give a good answer?" — that's a vibes check. Manual smoke
  tests with golden scenarios are the right tool.
- Embedding quality. We test that `topK` returns chunks in the right order
  *given fixed embeddings*. Whether `bge-small` is a good embedder for our
  docs is a manual eval.
- Hosted provider behavior — when we add it, it gets its own thin contract
  test (the interface holds) plus the same scenario suite via record/replay.

The point is to make the surface area we *can* test as large as possible,
and to be explicit about the slice we deliberately don't.

## Priority order

What makes the rewrite *worth doing* vs. polish:

**Must-have — defines the rewrite:**

1. `ChatProvider` interface + `TransformersJSProvider` (v1 default) +
   `MockProvider` (built alongside, not after)
2. Testable seams: `Embedder`, `Clock`, `IDProvider` interfaces;
   `InMemoryWorkspace` test impl
3. In-prompt `<tool_call>` protocol + parser (`tool-protocol.ts`)
4. Default Qwen 2.5 Coder 1.5B via `onnx-community/*`; refreshed
   Models tab listing
5. RAG indexer + `search_docs` + auto-retrieval (shares
   `@huggingface/transformers` with the LLM provider)
6. Range-based `apply_edit`
7. `get_diagnostics` tool
8. Plan / execute / summary three-phase loop
9. Token budgeting + summarization
10. File-layout split + typed tool registry
11. Scenario-based test runner reading `tests/agent/scenarios/*.json`
12. `WebLLMProvider` retained as alternate (existing code mostly moves
    behind the new interface)

**Strong-have — big wins, doable in scope:**

9. Auto workspace-context block
10. `get_editor_context` tool
11. Logs integration (route AI subsystem through `appLog` with `ai/*` channels)
12. Slash command registry with `/context`, `/tools`, `/model`, `/logs`, `/help`
13. Few-shot system prompt
14. Per-project `.fade/assistant.md`

**Nice-have — later:**

15. `RecordingProvider` / `ReplayProvider` for fixture-based regression tests
16. Playwright E2E suite driven by `MockProvider`
17. Token / latency panel
18. Conversation branching
19. Multi-file diff review
20. "Stop and ask" tool (agent pauses to ask a clarifying question)
21. `OllamaProvider` for power users with a local Ollama install
22. `wllama` provider for Safari / no-WebGPU users
23. Custom WASM compile for WebLLM with extended context (only if we end
    up needing WebLLM's speed *and* its 4K cap pinches)

## Open risks

Resolved facts that *were* risks (kept here so future readers don't
re-litigate them):

- ~~WebLLM may not ship Qwen 2.5 Coder.~~ **Confirmed shipped** in WebLLM
  but capped at 4K — moot since we're defaulting to transformers.js.
- ~~Phi-3.5 / Qwen Coder long context works in browsers.~~ **Works via
  transformers.js** (native model config respected). Does not work via
  WebLLM (4K override on all prebuilts).
- ~~Tool calling works on any model the user picks.~~ Via WebLLM,
  allow-listed to 5 Hermes IDs. Via transformers.js, works on any model
  through the in-prompt protocol. Default path is the latter.
- ~~Is transformers.js the same lib as the RAG embedder.~~ **Yes**:
  `@huggingface/transformers` (formerly `@xenova/transformers`). One
  dependency for both.

Still open:

- **Inference speed on transformers.js.** ONNX Runtime Web's WebGPU
  backend is slower per token than WebLLM's hand-tuned MLC kernels. For
  Qwen Coder 1.5B with WebGPU enabled it should be interactive but
  visibly slower than WebLLM. **Benchmark required before locking the
  default.** Mitigation if it's too slow: WASM fallback won't help,
  but switching to a smaller model (e.g. Qwen Coder 0.5B if available
  as ONNX) or aggressive q4 quantization helps. We may also discover
  the 7B variant is impractical on the default path and have to gate
  it behind a "power user" toggle.
- **Qwen 2.5 Coder 7B ONNX availability.** Confirmed only that
  `onnx-community/Qwen2.5-Coder-1.5B-Instruct` exists. The 7B variant
  may or may not be converted — verify at build time. Worst case we
  convert it ourselves (one-shot script with the optimum-cli tool).
- **In-prompt tool-calling reliability.** Smaller models occasionally
  emit malformed JSON, hallucinate tool names, or skip the
  `<tool_call>` tags entirely. Mitigations: Zod validation + error
  feedback loop, capped retry per tool call, structured fallback
  ("I tried to call X but the args were invalid"). Test this
  aggressively in the scenario suite — it's the most fragile seam in
  the design.
- **Embedder + LLM share the library, not the model.** Loading two
  separate models (bge-small for embeddings + Qwen Coder for chat) is
  two downloads, two IndexedDB entries, two warm-up paths. Pre-fetch
  the embedder in the background while the user is reading docs, so
  the first chat message doesn't pay both costs serially.
- **Planning latency.** The plan step adds 1–2s before any visible
  output. Mitigate by streaming the plan JSON into the plan panel as
  it generates — feels responsive even if the agent hasn't started
  executing yet.
- **Initial model download UX.** Qwen Coder 1.5B in q4 ONNX is roughly
  ~1 GB. First-run experience is "download a model before you can
  chat." Mirror WebLLM's existing progress UX, and consider letting
  the user pick a smaller fallback (Llama 3.2 1B, ~700 MB) on first
  load.
- **No `run_fade` tool.** Per the user's constraint, we cannot execute
  the user's program from the agent. The feedback loop is
  `apply_edit → get_diagnostics`, not `apply_edit → run → observe`.
  This is a real ceiling on the agent's debugging ability that no
  amount of model improvement will fix on its own.
