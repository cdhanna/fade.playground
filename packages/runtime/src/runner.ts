// FadeRunner — the DOM-free transport client for the FadeBasic runtime.
//
// Owns the LSP Web Worker (language intelligence) and drives the VM iframe
// (execution + the DAP-like debug protocol) over postMessage. Extracted from
// the Playground's main.ts (Phase 2b). Uses only `window` (message bus +
// prompt fallback) and `Worker` — no document/panel coupling.

import type {
    RunnerOpts,
    Diagnostic,
    DocSymbol,
    FoldingRange,
    TextEdit,
    WorkspaceEdit,
    FormattingOptions,
    TestEntry,
    CommandDocEntry,
    TestResult,
    TestRunResult,
    DebugStartResult,
    BreakpointRequest,
    DebugStackFrame,
    DebugScopesResult,
    DebugEvalResult,
    DebugEvent,
    SignatureHelp,
    Location,
    HoverInfo,
    CompletionItem,
    SnippetToken,
} from './protocol';

export class FadeRunner {
    // One worker for LSP traffic — never executes user code, stays
    // responsive while the VM does its thing. The VM itself lives in
    // the active template's iframe (on the iframe's main thread); the
    // Runner posts VM-side messages to iframe.contentWindow via the
    // postVm helper. attachVmIframe() points the runner at an iframe;
    // before that, VM-side calls that need a target are skipped (only
    // LSP is meaningful pre-iframe).
    public lspWorker: Worker;
    /** Back-compat alias — old code referenced runner.worker for raw access. */
    public get worker(): Worker { return this.lspWorker; }
    private vmTarget: Window | null = null;
    private vmIframe: HTMLIFrameElement | null = null;
    private opts: RunnerOpts;
    private nextId = 0;
    private pending = new Map<number, (result: any) => void>();
    private onDiagnostics?: (uri: string, diagnostics: Diagnostic[]) => void;
    // Page-side handler registry for the cooperative pump's host-message
    // protocol. Library commands call HostBridge.PostMessage(channel, payload)
    // in C#; the runtime forwards as { type: 'host-message', channel, payload }.
    // We dispatch by channel name to a registered handler that returns
    // { resultType, value }, post that back as 'host-reply', and the runtime's
    // generic dispatcher does the placeholder swap. Plugin authors register
    // their own channels at runtime via registerHostHandler.
    private hostHandlers: Record<string, (payload: string) =>
        Promise<{ resultType: string; value?: any }> | { resultType: string; value?: any }> = {};
    onPromptRequest?: (msg: string) => Promise<string | null> | string | null;
    onDebugEvent?: (event: DebugEvent) => void;
    // Live program output (`print` / stdout / stderr). Settable by whichever
    // component is currently running, so e.g. the MonoGame IDE can stream print
    // lines into its console pane (the game canvas can't show them). The web VM
    // renders print inside its own iframe, so this is mainly for MonoGame.
    onOutput?: (line: string, isError: boolean) => void;
    // Per-test progress: fires once per finalized test during a
    // runTests call, mid-run. Result shape matches a single entry
    // in TestRunResult.results — the same applyResult logic can
    // consume it directly. Streaming lets the tests panel flip
    // each row from "running" to pass/fail as tests complete,
    // instead of waiting for the terminal result.
    onTestProgress?: (result: TestResult) => void;
    ready: Promise<void>;

    constructor(opts: RunnerOpts) {
        this.opts = opts;
        // Load the LSP worker from the configured asset base (default
        // '/runtime/'); normalize to a single trailing slash so
        // assetBase='/fade' and '/fade/' both resolve correctly.
        const assetBase = (opts.assetBase ?? '/runtime/').replace(/\/*$/, '/');
        this.lspWorker = new Worker(assetBase + 'web/worker.js', { type: 'module' });
        // worker.js's first-message contract: configure role so heartbeat
        // / log events carry the right tag. The VM-side runtime lives in
        // the iframe (no Worker), so there's no second configure call.
        this.lspWorker.postMessage({ type: 'configure', role: 'lsp' });

        // prompt$ default handler — bridged through the cooperative
        // pump's host-message protocol. The iframe itself owns the
        // prompt UI (window.prompt in the iframe's window), so this
        // hostHandler runs only when the parent receives a host-message
        // event the iframe DIDN'T consume (e.g., a future plugin
        // channel registered on the parent).
        this.hostHandlers['fade-web/prompt'] = async (payload) => {
            let answer = '';
            try {
                const cb = this.onPromptRequest;
                answer = (cb ? await cb(payload) : window.prompt(payload)) ?? '';
            } catch { answer = ''; }
            return { resultType: 'string', value: answer };
        };

        this.ready = new Promise<void>((resolve, reject) => {
            // Resolve `ready` as soon as the LSP worker boots. The VM
            // iframe boots lazily (on first ensureWebPreviewArmed) and
            // gates its own ready via `preview-armed`; the runner's
            // ready promise just means LSP is alive for the editor.
            this.lspWorker.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'ready') { resolve(); return; }
                this.handleWorkerMessage(msg, reject);
            };
            this.lspWorker.onerror = (e: ErrorEvent) =>
                reject(new Error('lsp worker error: ' + e.message));
        });
    }

    // Post a VM-side message to the active iframe. No-op when no iframe
    // is attached (lifecycle setup happens lspWorker-side; VM ops never
    // fire before ensureWebPreviewArmed). Returns true if the message
    // was posted, false if it was dropped — the callers that need to
    // await a reply check this before registering a pending entry.
    private postVm(msg: any, transfer: Transferable[] = []): boolean {
        if (!this.vmTarget) return false;
        this.vmTarget.postMessage(msg, '*', transfer);
        return true;
    }

    // Switch VM-side traffic to flow through the given iframe. The
    // iframe must already be loaded and have posted 'preview-armed';
    // the caller is responsible for the bootstrap handshake. After
    // this, postVm targets iframe.contentWindow; future VM-side runs /
    // tests / debug all flow through the visible template iframe.
    attachVmIframe(iframe: HTMLIFrameElement): void {
        this.vmIframe = iframe;
        this.vmTarget = iframe.contentWindow;
        // Listen for messages from the iframe's window so the dispatcher
        // sees them like LSP-worker messages. We filter to messages
        // whose source is exactly the iframe's contentWindow to avoid
        // mixing up postMessages from other windows on the page.
        window.addEventListener('message', (e) => {
            if (!this.vmIframe) return;
            if (e.source !== this.vmIframe.contentWindow) return;
            const msg = e.data;
            if (!msg || typeof msg !== 'object') return;
            // 'preview-ready' / 'preview-armed' are iframe lifecycle
            // signals consumed by the bootstrap code, not VM events.
            if (msg.type === 'preview-ready' || msg.type === 'preview-armed') return;
            this.handleWorkerMessage(msg, () => { /* iframe errors surfaced via UI separately */ });
        });
    }

    // Detach the iframe. After this, postVm is a no-op until another
    // attachVmIframe call. Used when leaving a web project for a non-
    // iframe-driven mode (e.g. monogame today, until phase 2 unifies).
    detachVmIframe(): void {
        this.vmIframe = null;
        this.vmTarget = null;
    }

    // Dispatches a single message from either worker. The `ready` event
    // is intercepted before this runs (so it can resolve the boot promise),
    // and every other message is one of: heartbeat, print/alert, an
    // *-result reply matching a pending id, a debug event, a prompt
    // request, a streamed LSP diagnostic, a log line, a boot error, or a
    // misroute warning.
    private handleWorkerMessage(msg: any, reject: (err: Error) => void): void {
        if (msg.type === 'heartbeat') { this.opts.onHeartbeat?.(msg.role ?? 'lsp', msg.tick, msg.t); return; }
        if (msg.type === 'print') { (this.onOutput ? this.onOutput(msg.line, false) : this.opts.onPrint(msg.line)); return; }
        // MonoGame forwards user `print` (and runtime messages) as stdout/stderr
        // from the game iframe — route them to the live output hook.
        if (msg.type === 'stdout') { (this.onOutput ?? ((l: string) => this.opts.onPrint(l)))(msg.line, false); return; }
        if (msg.type === 'stderr') { this.onOutput?.(msg.line, true); return; }
        if (msg.type === 'alert') { this.opts.onAlert(msg.msg); return; }
        if (msg.type === 'result') {
            const r = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (r) r(msg.result);
            return;
        }
        if (msg.type === 'lsp-check-result')          { this.resolvePending(msg.id, msg.diagnostics); return; }
        if (msg.type === 'lsp-tokens-result')         { this.resolvePending(msg.id, msg.tokens); return; }
        if (msg.type === 'lsp-hover-result')          { this.resolvePending(msg.id, msg.hover); return; }
        if (msg.type === 'lsp-completion-result')     { this.resolvePending(msg.id, msg.items); return; }
        if (msg.type === 'lsp-signature-help-result') { this.resolvePending(msg.id, msg.sig); return; }
        if (msg.type === 'lsp-references-result')     { this.resolvePending(msg.id, msg.refs); return; }
        if (msg.type === 'lsp-definition-result')     { this.resolvePending(msg.id, msg.def); return; }
        if (msg.type === 'lsp-document-symbols-result') { this.resolvePending(msg.id, msg.symbols); return; }
        if (msg.type === 'lsp-folding-ranges-result') { this.resolvePending(msg.id, msg.ranges); return; }
        if (msg.type === 'lsp-format-result'
            || msg.type === 'lsp-format-range-result'
            || msg.type === 'lsp-format-on-type-result') {
            this.resolvePending(msg.id, msg.edits); return;
        }
        if (msg.type === 'lsp-rename-result')         { this.resolvePending(msg.id, msg.edit); return; }
        if (msg.type === 'set-project-type-result')            { this.resolvePending(msg.id, msg.projectType); return; }
        if (msg.type === 'register-command-assembly-result')   { this.resolvePending(msg.id, msg.result); return; }
        if (msg.type === 'load-assembly-result')               { this.resolvePending(msg.id, msg.result); return; }
        if (msg.type === 'clear-command-assemblies-result')    { this.resolvePending(msg.id, undefined); return; }
        if (msg.type === 'list-tests-result')         { this.resolvePending(msg.id, msg.tests); return; }
        if (msg.type === 'list-command-docs-result')  { this.resolvePending(msg.id, msg.docs); return; }
        if (msg.type === 'lsp-tokenize-snippet-result') { this.resolvePending(msg.id, msg.tokens); return; }
        if (msg.type === 'get-version-info-result')   { this.resolvePending(msg.id, msg.info); return; }
        if (msg.type === 'run-tests-result')          { this.resolvePending(msg.id, msg.result); return; }
        if (msg.type === 'debug-start-result')        { this.resolvePending(msg.id, msg.result); return; }
        if (msg.type === 'debug-terminate-result'
            || msg.type === 'debug-set-breakpoints-result'
            || msg.type === 'debug-step-result'
            || msg.type === 'debug-continue-result'
            || msg.type === 'debug-pause-result') {
            this.resolvePending(msg.id, true); return;
        }
        // Payload key varies by VM target: the web worker + Export.Web iframe
        // name the inspection payload per message (`frames` / `scopes`), but
        // the MonoGame iframe's generic invokeAndReply wraps every reply as
        // `{ result }`. Accept `result` as a fallback so both drive the runner.
        if (msg.type === 'debug-stack-frames-result') { this.resolvePending(msg.id, msg.frames ?? msg.result); return; }
        if (msg.type === 'debug-resolve-instruction-result') { this.resolvePending(msg.id, msg.result); return; }
        if (msg.type === 'debug-scopes-result'
            || msg.type === 'debug-variable-expansion-result') {
            this.resolvePending(msg.id, msg.scopes ?? msg.result); return;
        }
        if (msg.type === 'debug-eval-result'
            || msg.type === 'debug-repl-result'
            || msg.type === 'debug-set-variable-result') {
            this.resolvePending(msg.id, msg.result); return;
        }
        if (msg.type === 'debug-event') {
            if (this.onDebugEvent) this.onDebugEvent(msg.event);
            return;
        }
        if (msg.type === 'host-message') { this.handleHostMessage(msg); return; }
        if (msg.type === 'test-progress') { this.onTestProgress?.(msg.result); return; }
        if (msg.type === 'get-debug-test-result-result') { this.resolvePending(msg.id, msg.result); return; }
        if (msg.type === 'run-tick-result') { this.resolvePending(msg.id, msg.result); return; }
        if (msg.type === 'compile-to-bytecode-result') {
            this.resolvePending(msg.id, { status: msg.status, bytecode: msg.bytecode });
            return;
        }
        if (msg.type === 'lsp-diagnostics') {
            if (this.onDiagnostics) {
                const parsed: Diagnostic[] = JSON.parse(msg.diagnostics);
                this.onDiagnostics(msg.uri, parsed);
            }
            return;
        }
        if (msg.type === 'log') { console.log('[runtime worker]', msg.message); return; }
        if (msg.type === 'boot-error') { reject(new Error(msg.message)); return; }
        if (msg.type === 'worker-misroute') {
            console.warn('[fade] worker misroute', msg);
            // Resolve any pending id with null so callers don't hang.
            if (msg.id != null) this.resolvePending(msg.id, null);
            return;
        }
    }

    private resolvePending(id: number, value: any): void {
        const r = this.pending.get(id);
        this.pending.delete(id);
        if (r) r(value);
    }

    // No-op since the SAB-based interrupt was removed. Previously this
    // wrote into a SharedArrayBuffer the vm-worker's waitMsInterruptible
    // was Atomics.wait'ing on, so pause/terminate/breakpoint changes
    // could wake a running `wait ms` faster than the regular postMessage
    // round-trip would. In the cooperative-pump model `wait ms` is just
    // a setTimeout on the pump and never blocks the worker thread, so
    // the regular debug-pause/debug-terminate postMessages land between
    // ticks without needing a side-channel wake.
    //
    // Kept as a no-op rather than deleted because debug-flow callers
    // still invoke it for clarity. Remove the calls (and this method)
    // once we're sure no debug regression depends on the side-channel.
    interruptWait(_kind: 1 | 2 | 3): void { /* no-op — see comment */ }

    // Runs Fade source through the cooperative pump (prompt$ + wait ms
    // both work). The worker emits exactly one 'run-tick-result' as the
    // terminal event for this run. The resolved value is the JSON
    // envelope: { ok, error?, compileError? }.
    //
    // Note: this no longer uses the old synchronous CompileAndRun path
    // (which is gone). Callers should JSON.parse the resolved string;
    // there's no `printed` field — print output streams live via the
    // worker's per-line `print` messages (opts.onPrint).
    run(source: string): Promise<string> {
        const id = ++this.nextId;
        return new Promise<string>((resolve) => {
            this.pending.set(id, resolve);
            this.postVm({ type: 'run-start-source', id, source });
        });
    }

    // Terminate an in-flight run. Fire-and-forget: the pump posts its
    // own terminal `run-tick-result` to whatever id the originating
    // run() call registered, so the run() promise resolves with
    // `{ ok: false, error: 'stopped' }`. Calling this when no run is
    // active is a no-op.
    stopRun(): void {
        this.postVm({ type: 'stop-run' });
    }

    setDocument(uri: string, text: string) {
        this.worker.postMessage({ type: 'lsp-set', uri, text });
    }

    /** Synchronous LSP document check — returns diagnostics without waiting
     *  for Monaco markers. Used by the AI edit reviewer. */
    async checkDocumentDiagnostics(uri: string, text: string, timeoutMs = 8_000): Promise<Diagnostic[]> {
        const id = ++this.nextId;
        return new Promise<Diagnostic[]>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('LSP worker did not respond (rebuild runtime or reload)'));
            }, timeoutMs);
            this.pending.set(id, (diagnosticsJson: string) => {
                clearTimeout(timer);
                try {
                    const parsed = JSON.parse(diagnosticsJson);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.lspWorker.postMessage({ type: 'lsp-check', id, uri, text });
        });
    }

    // Switch both workers' LSP CommandCollection to match the active
    // fade.json type. Both workers run worker.js so we fire the message
    // to each — LSP worker needs the right commands for tokens/hover/
    // diagnostics, VM worker matters once Run/Tests for that type land
    // there (today monogame Run/Tests go through WebRuntime.MonoGame
    // directly, so the vm-worker call is a no-op for monogame but
    // harmless and keeps the two workers in sync).
    async setProjectType(projectType: string): Promise<void> {
        // LSP worker always gets the update. The VM iframe gets it only
        // if attached — pre-attach, the iframe receives the project's
        // command DLL set via the bootstrap message instead, and the
        // type isn't surfaced separately to the VM runtime.
        const awaits: Promise<unknown>[] = [];
        awaits.push(new Promise<void>((resolve) => {
            const id = ++this.nextId;
            this.pending.set(id, () => resolve());
            this.lspWorker.postMessage({ type: 'set-project-type', id, projectType });
        }));
        if (this.vmTarget) {
            awaits.push(new Promise<void>((resolve) => {
                const id = ++this.nextId;
                this.pending.set(id, () => resolve());
                this.postVm({ type: 'set-project-type', id, projectType });
            }));
        }
        await Promise.all(awaits);
    }

    // Load a sibling assembly into the LSP runtime (only) — used to
    // pre-register dependencies of a command DLL so that, when the
    // actual command-source class is Activator.CreateInstance'd, the
    // AppDomain can resolve its referenced types. Mirrors the
    // load-assembly op the static-host bootstrap uses to pre-load dep
    // DLLs before the entry assembly. Not posted to the VM iframe — the
    // iframe's runtime owns its own static references.
    async loadAssembly(dllBytes: ArrayBuffer): Promise<{ ok: boolean; error?: string }> {
        const id = ++this.nextId;
        const postLsp = new Promise<string>((resolve) => {
            this.pending.set(id, (result: string) => resolve(result));
            this.lspWorker.postMessage({ type: 'load-assembly', id, dllBytes });
        });
        const result = await postLsp;
        try { return JSON.parse(result); } catch { return { ok: false, error: 'parse failed' }; }
    }

    // Load a command DLL into both the LSP runtime and (if attached)
    // the VM iframe. dllBytes is the raw assembly content fetched from
    // /runtime/fade-libs/<x>.dll (or from OPFS for user-uploaded
    // plugins). Pre-iframe, the VM side will pick up the DLL via the
    // bootstrap commandDlls list.
    async registerCommandAssembly(dllBytes: ArrayBuffer, className: string): Promise<{ ok: boolean; error?: string }> {
        const postLsp = new Promise<string>((resolve) => {
            const id = ++this.nextId;
            this.pending.set(id, (result: string) => resolve(result));
            this.lspWorker.postMessage({ type: 'register-command-assembly', id, dllBytes, className });
        });
        const awaits: Promise<string>[] = [postLsp];
        if (this.vmTarget) {
            awaits.push(new Promise<string>((resolve) => {
                const id = ++this.nextId;
                this.pending.set(id, (result: string) => resolve(result));
                this.postVm({ type: 'register-command-assembly', id, dllBytes, className });
            }));
        }
        const results = await Promise.all(awaits);
        // Prefer the VM-side result if available (matches the previous
        // behavior of returning the VM target's parse). Fall back to
        // the LSP-side result when no iframe is attached.
        const primary = results[results.length - 1];
        try { return JSON.parse(primary); } catch { return { ok: false, error: 'parse failed' }; }
    }

    // Drop all dynamically-loaded command sources from both runtimes.
    async clearCommandAssemblies(): Promise<void> {
        const awaits: Promise<unknown>[] = [];
        awaits.push(new Promise<void>((resolve) => {
            const id = ++this.nextId;
            this.pending.set(id, () => resolve());
            this.lspWorker.postMessage({ type: 'clear-command-assemblies', id });
        }));
        if (this.vmTarget) {
            awaits.push(new Promise<void>((resolve) => {
                const id = ++this.nextId;
                this.pending.set(id, () => resolve());
                this.postVm({ type: 'clear-command-assemblies', id });
            }));
        }
        await Promise.all(awaits);
    }

    async getTokens(uri: string): Promise<number[]> {
        const id = ++this.nextId;
        return new Promise<number[]>((resolve) => {
            this.pending.set(id, (tokensJson: string) => {
                try { resolve(JSON.parse(tokensJson)); } catch { resolve([]); }
            });
            this.worker.postMessage({ type: 'lsp-tokens', id, uri });
        });
    }

    async getHover(uri: string, line: number, character: number): Promise<HoverInfo | null> {
        const id = ++this.nextId;
        return new Promise<HoverInfo | null>((resolve) => {
            this.pending.set(id, (hoverJson: string) => {
                try {
                    const parsed = JSON.parse(hoverJson);
                    resolve(parsed);
                } catch { resolve(null); }
            });
            this.worker.postMessage({ type: 'lsp-hover', id, uri, line, character });
        });
    }

    async getCompletions(uri: string, line: number, character: number): Promise<CompletionItem[]> {
        const id = ++this.nextId;
        return new Promise<CompletionItem[]>((resolve) => {
            this.pending.set(id, (itemsJson: string) => {
                try {
                    const parsed = JSON.parse(itemsJson);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.worker.postMessage({ type: 'lsp-completion', id, uri, line, character });
        });
    }

    async getSignatureHelp(uri: string, line: number, character: number): Promise<SignatureHelp | null> {
        const id = ++this.nextId;
        return new Promise<SignatureHelp | null>((resolve) => {
            this.pending.set(id, (sigJson: string) => {
                try { resolve(JSON.parse(sigJson)); } catch { resolve(null); }
            });
            this.worker.postMessage({ type: 'lsp-signature-help', id, uri, line, character });
        });
    }

    async getReferences(uri: string, line: number, character: number): Promise<Location[]> {
        const id = ++this.nextId;
        return new Promise<Location[]>((resolve) => {
            this.pending.set(id, (refsJson: string) => {
                try {
                    const parsed = JSON.parse(refsJson);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.worker.postMessage({ type: 'lsp-references', id, uri, line, character });
        });
    }

    async getDefinition(uri: string, line: number, character: number): Promise<Location | null> {
        const id = ++this.nextId;
        return new Promise<Location | null>((resolve) => {
            this.pending.set(id, (defJson: string) => {
                try { resolve(JSON.parse(defJson)); } catch { resolve(null); }
            });
            this.worker.postMessage({ type: 'lsp-definition', id, uri, line, character });
        });
    }

    async getDocumentSymbols(uri: string): Promise<DocSymbol[]> {
        const id = ++this.nextId;
        return new Promise<DocSymbol[]>((resolve) => {
            this.pending.set(id, (json: string) => {
                try {
                    const parsed = JSON.parse(json);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.worker.postMessage({ type: 'lsp-document-symbols', id, uri });
        });
    }

    async getFoldingRanges(uri: string): Promise<FoldingRange[]> {
        const id = ++this.nextId;
        return new Promise<FoldingRange[]>((resolve) => {
            this.pending.set(id, (json: string) => {
                try {
                    const parsed = JSON.parse(json);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.worker.postMessage({ type: 'lsp-folding-ranges', id, uri });
        });
    }

    async format(uri: string, options: FormattingOptions): Promise<TextEdit[]> {
        const id = ++this.nextId;
        return new Promise<TextEdit[]>((resolve) => {
            this.pending.set(id, (json: string) => {
                try {
                    const parsed = JSON.parse(json);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.worker.postMessage({ type: 'lsp-format', id, uri, options: JSON.stringify(options) });
        });
    }

    async formatRange(uri: string, options: FormattingOptions, range: { startLine: number; startCh: number; endLine: number; endCh: number }): Promise<TextEdit[]> {
        const id = ++this.nextId;
        return new Promise<TextEdit[]>((resolve) => {
            this.pending.set(id, (json: string) => {
                try {
                    const parsed = JSON.parse(json);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.worker.postMessage({
                type: 'lsp-format-range', id, uri,
                options: JSON.stringify(options),
                ...range,
            });
        });
    }

    async formatOnType(uri: string, options: FormattingOptions, line: number, character: number): Promise<TextEdit[]> {
        const id = ++this.nextId;
        return new Promise<TextEdit[]>((resolve) => {
            this.pending.set(id, (json: string) => {
                try {
                    const parsed = JSON.parse(json);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.worker.postMessage({
                type: 'lsp-format-on-type', id, uri,
                options: JSON.stringify(options),
                line, character,
            });
        });
    }

    async rename(uri: string, line: number, character: number, newName: string): Promise<WorkspaceEdit | null> {
        const id = ++this.nextId;
        return new Promise<WorkspaceEdit | null>((resolve) => {
            this.pending.set(id, (json: string) => {
                try { resolve(JSON.parse(json)); } catch { resolve(null); }
            });
            this.worker.postMessage({ type: 'lsp-rename', id, uri, line, character, newName });
        });
    }

    // Tests are discovered by the compiler (macro expansion produces the real
    // per-iteration names like `sample_0`), which lives on the VM side — so this
    // routes through postVm, not the LSP worker. Requires the VM iframe armed.
    async listTests(source: string): Promise<TestEntry[]> {
        const id = ++this.nextId;
        return new Promise<TestEntry[]>((resolve) => {
            this.pending.set(id, (json: string) => {
                try {
                    const parsed = JSON.parse(json);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            if (!this.postVm({ type: 'list-tests', id, source })) {
                this.pending.delete(id);
                resolve([]);   // VM not armed yet
            }
        });
    }

    // Fetches a flat list of every loaded command with its hover-style
    // markdown. The Help tab calls this once on bootstrap (and again on
    // any future command-set change). Lives on the LSP worker — pure
    // metadata read, doesn't touch the VM.
    async listCommandDocs(): Promise<CommandDocEntry[]> {
        const id = ++this.nextId;
        return new Promise<CommandDocEntry[]>((resolve) => {
            this.pending.set(id, (json: string) => {
                try {
                    const parsed = JSON.parse(json);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.lspWorker.postMessage({ type: 'list-command-docs', id });
        });
    }

    // Free-floating tokenize for Help-tab code blocks — bypasses the LSP
    // workspace's _docs map so it doesn't publish diagnostics or churn the
    // open-file set. Returns the legend-classified tokens (line/col/length/
    // type) the help-side renderer wraps into spans.
    async tokenizeSnippet(source: string): Promise<SnippetToken[]> {
        const id = ++this.nextId;
        return new Promise<SnippetToken[]>((resolve) => {
            this.pending.set(id, (json: string) => {
                try {
                    const parsed = JSON.parse(json);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.lspWorker.postMessage({ type: 'lsp-tokenize-snippet', id, source });
        });
    }

    async getVersionInfo(): Promise<{ fadeBasic: string; dotnet: string } | null> {
        const id = ++this.nextId;
        return new Promise((resolve) => {
            this.pending.set(id, (json: string) => {
                try { resolve(JSON.parse(json)); }
                catch { resolve(null); }
            });
            this.lspWorker.postMessage({ type: 'get-version-info', id });
        });
    }

    // Resolve a VM instruction index to a joined-source location via the
    // active debug session's IndexCollection. Used by the crash overlay:
    // REV_REQUEST_EXPLODE messages carry `ins=[N]` in their formatted
    // text, but the line/char lives in DebugData on the iframe side. Round
    // trip is cheap (one C# binary search). Returns null when no session
    // is active or the index falls outside the program's statement tokens.
    async resolveInstruction(insIndex: number): Promise<{ insIndex: number; lineNumber: number; charNumber: number } | null> {
        if (!this.vmTarget) return null;
        const id = ++this.nextId;
        return new Promise((resolve) => {
            this.pending.set(id, (json: string) => {
                try {
                    const parsed = JSON.parse(json);
                    resolve(parsed === null ? null : parsed);
                } catch { resolve(null); }
            });
            this.postVm({ type: 'debug-resolve-instruction', id, insIndex });
        });
    }

    async runTests(source: string, testName?: string): Promise<TestRunResult> {
        const id = ++this.nextId;
        return new Promise<TestRunResult>((resolve) => {
            this.pending.set(id, (json: string) => {
                try { resolve(JSON.parse(json)); }
                catch { resolve({ passed: 0, failed: 0, duration: 0, results: [], printed: '', error: 'parse failed' }); }
            });
            this.postVm({ type: 'run-tests', id, source, testName: testName || '' });
        });
    }

    // ── Debug session ─────────────────────────────────────────────────────
    async debugStart(source: string): Promise<DebugStartResult> {
        const id = ++this.nextId;
        return new Promise<DebugStartResult>((resolve) => {
            this.pending.set(id, (json: string) => {
                try { resolve(JSON.parse(json)); }
                catch { resolve({ ok: false, error: 'parse failed', statementLines: [] }); }
            });
            this.postVm({ type: 'debug-start', id, source });
        });
    }
    async debugStartTest(source: string, testName: string): Promise<DebugStartResult> {
        const id = ++this.nextId;
        return new Promise<DebugStartResult>((resolve) => {
            this.pending.set(id, (json: string) => {
                try { resolve(JSON.parse(json)); }
                catch { resolve({ ok: false, error: 'parse failed', statementLines: [] }); }
            });
            this.postVm({ type: 'debug-start-test', id, source, testName });
        });
    }
    debugTerminate(): Promise<boolean> {
        this.interruptWait(2);
        return this.fireDebugCall('debug-terminate');
    }
    debugContinue(): Promise<boolean> { return this.fireDebugCall('debug-continue'); }
    debugPause(): Promise<boolean> {
        // Wake any in-flight `wait ms` early AND tell C# this was a pause
        // request — WaitImpl will enqueue REQUEST_PAUSE synchronously so
        // the next VM instruction check pauses, instead of waiting for
        // the worker JS event loop to drain the debug-pause postMessage
        // (which can take up to a full DebugTick budget).
        this.interruptWait(1);
        return this.fireDebugCall('debug-pause');
    }
    debugStep(kind: 'over' | 'in' | 'out'): Promise<boolean> {
        return this.fireDebugCall('debug-step', { kind });
    }
    debugSetBreakpoints(breakpoints: BreakpointRequest[]): Promise<boolean> {
        // Wake any in-flight `wait ms` so the worker's JS event loop yields
        // and picks up this breakpoint update without waiting out the rest
        // of the sleep. Without this, adding/removing a breakpoint mid-
        // `wait ms(3000)` only takes effect on the next loop iteration.
        this.interruptWait(3);
        return this.fireDebugCall('debug-set-breakpoints', {
            linesJson: JSON.stringify(breakpoints),
        });
    }
    // Snapshot the in-flight debug-test session's pass/fail state. Returns
    // null when the session isn't a test debug (or when there's no live
    // session at all). The Playground calls this when a debug-test
    // session emits 'complete' so it can flip the test row from
    // 'running' → 'pass'/'fail' before the session is torn down.
    debugGetTestResult(): Promise<TestResult | null> {
        const id = ++this.nextId;
        return new Promise<TestResult | null>((resolve) => {
            this.pending.set(id, (json: string) => {
                if (!json || json === 'null') { resolve(null); return; }
                try { resolve(JSON.parse(json) as TestResult); }
                catch { resolve(null); }
            });
            this.postVm({ type: 'get-debug-test-result', id });
        });
    }

    debugStackFrames(): Promise<DebugStackFrame[]> {
        const id = ++this.nextId;
        return new Promise<DebugStackFrame[]>((resolve) => {
            this.pending.set(id, (json: string) => {
                try {
                    const parsed = JSON.parse(json);
                    resolve(Array.isArray(parsed) ? parsed : []);
                } catch { resolve([]); }
            });
            this.postVm({ type: 'debug-stack-frames', id });
        });
    }
    debugScopes(frameId: number): Promise<DebugScopesResult> {
        const id = ++this.nextId;
        return new Promise<DebugScopesResult>((resolve) => {
            this.pending.set(id, (json: string) => {
                try { resolve(JSON.parse(json)); } catch { resolve({ scopes: [] }); }
            });
            this.postVm({ type: 'debug-scopes', id, frameId });
        });
    }
    debugExpandVariable(variableId: number): Promise<DebugScopesResult> {
        const id = ++this.nextId;
        return new Promise<DebugScopesResult>((resolve) => {
            this.pending.set(id, (json: string) => {
                try { resolve(JSON.parse(json)); } catch { resolve({ scopes: [] }); }
            });
            this.postVm({ type: 'debug-variable-expansion', id, variableId });
        });
    }
    debugEval(frameId: number, expression: string): Promise<DebugEvalResult | null> {
        return this.debugTextCall('debug-eval', { frameId, expression });
    }
    debugRepl(frameId: number, code: string): Promise<DebugEvalResult | null> {
        return this.debugTextCall('debug-repl', { frameId, code });
    }
    debugSetVariable(frameId: number, variableId: number, rhs: string): Promise<DebugEvalResult | null> {
        return this.debugTextCall('debug-set-variable', { frameId, variableId, rhs });
    }
    private simpleDebugCall(type: string): Promise<boolean> {
        const id = ++this.nextId;
        return new Promise<boolean>((resolve) => {
            this.pending.set(id, () => resolve(true));
            this.postVm({ type, id });
        });
    }
    // Fire-and-forget control-plane debug call (continue / pause / step /
    // set-breakpoints / terminate). These are inherently one-way: the
    // authoritative feedback is the async `debug-event` stream (paused,
    // breakpoint hit, step landed), never the call's return value, and
    // postMessage FIFO ordering guarantees e.g. set-breakpoints is applied
    // before a following continue. We resolve as soon as the message is
    // posted rather than awaiting a `*-result` reply, because not every VM
    // target sends one: the web worker + Export.Web iframe ack these, but
    // the MonoGame iframe invokes C# and returns without replying. Awaiting
    // a reply that never comes would hang the whole debug sequence (e.g.
    // `await pushBreakpoints()` blocking before `debugContinue()`). A late
    // ack for `id` is a harmless no-op — resolvePending ignores unknown ids.
    private fireDebugCall(type: string, extra?: object): Promise<boolean> {
        const id = ++this.nextId;
        this.postVm({ type, id, ...extra });
        return Promise.resolve(true);
    }
    private debugTextCall(type: string, payload: object): Promise<DebugEvalResult | null> {
        const id = ++this.nextId;
        return new Promise<DebugEvalResult | null>((resolve) => {
            this.pending.set(id, (json: string) => {
                try { resolve(JSON.parse(json)); } catch { resolve(null); }
            });
            this.postVm({ type, id, ...payload });
        });
    }

    // Called when the worker emits a host-message (HostBridge.PostMessage
    // on the C# side). Dispatches by channel name, awaits the handler,
    // and posts the typed reply back to the worker. Plugins extend the
    // handler set via registerHostHandler.
    private async handleHostMessage(msg: { channel: string; payload: string }): Promise<void> {
        const handler = this.hostHandlers[msg.channel];
        if (!handler) {
            console.warn('[fade] no host handler for channel:', msg.channel);
            this.postVm({ type: 'host-reply', resultType: 'string', value: '' });
            return;
        }
        try {
            const reply = await handler(msg.payload);
            this.postVm({ type: 'host-reply', ...reply });
        } catch (e) {
            console.error('[fade] host handler for', msg.channel, 'threw:', e);
            this.postVm({ type: 'host-reply', resultType: 'string', value: '' });
        }
    }

    // Register (or replace) a page-side handler for a HostBridge channel.
    // Library authors document which channel their cooperative commands
    // use; consumers plug in handlers here. The handler returns (or
    // resolves to) { resultType, value }; see worker.js's host-reply
    // dispatcher for the supported resultType strings.
    registerHostHandler(
        channel: string,
        fn: (payload: string) =>
            Promise<{ resultType: string; value?: any }> | { resultType: string; value?: any },
    ): void {
        this.hostHandlers[channel] = fn;
    }

    // Compile Fade source to a raw bytecode blob. The Playground uses
    // this for the export download and to feed the preview iframe. The
    // returned ArrayBuffer is transferable; status carries the compile
    // diagnostics envelope on failure.
    async compileToBytecode(source: string): Promise<{ ok: boolean; compileError?: string; bytecode?: ArrayBuffer }> {
        const id = ++this.nextId;
        const p = new Promise<{ status: string; bytecode: ArrayBuffer | null }>((resolve) => {
            this.pending.set(id, resolve);
            this.postVm({ type: 'compile-to-bytecode', id, source });
        });
        const r = await p;
        let parsed: any = {}; try { parsed = JSON.parse(r.status); } catch { /* */ }
        if (!parsed.ok) return { ok: false, compileError: parsed.compileError ?? parsed.error };
        return { ok: true, bytecode: r.bytecode ?? undefined };
    }

    setDiagnosticsHandler(fn: (uri: string, diagnostics: Diagnostic[]) => void) {
        this.onDiagnostics = fn;
    }
}
