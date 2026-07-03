// The FadeBasic debug contract — DOM-free. This is what any debug UI (the
// Playground's panels today; the embeddable debug components tomorrow) talks
// to, regardless of whether the debug runtime is in this browser ("local" —
// the runner / monoGameHost iframe) or driven by another peer in a live
// session ("remote" — the receiving end of session.debugState + RPC).
//
// Extracted from the Playground's src/debug/adapter.ts so the contract lives
// with @fadebasic/runtime and can be shared by the component library.

export type DebugStatus = 'idle' | 'starting' | 'running' | 'paused' | 'completed';
export type StepKind = 'over' | 'in' | 'out';

/** Raw debug event from the underlying runtime. Type-opaque from the
 *  adapter's perspective — consumers inspect `event.type` + `event.json` to
 *  decide what to do. Kept shapeless on purpose so the runner-side and
 *  monogame-side event variants don't need their schema centralised here. */
export interface DebugEvent {
    type: string;
    id?: number;
    json?: string;
    [key: string]: unknown;
}

/** Reverse-resolved source coordinates returned by `resolveInstruction`. */
export interface ResolvedInstruction {
    insIndex: number;
    lineNumber: number;
    charNumber: number;
}

export interface DebugAdapter {
    /** Identifier for which implementation is currently active. UI uses this
     *  to gate "you're observing" affordances vs. "you're driving" ones. */
    readonly kind: 'local' | 'remote';

    // ── Lifecycle ────────────────────────────────────────────────────────

    // Return types are `Promise<any>` throughout the inspection / command
    // surface: call sites consume runtime-shaped JSON-ish blobs that aren't
    // easy to type narrowly. Tightening this would force a sweep of every
    // reader; the cost of stricter types lives at the call sites.

    /** Start a normal debug session against the given source. Resolves with
     *  the runtime's start response (shape varies; treated as a JSON blob). */
    start(source: string): Promise<any>;
    /** Start a debug session focused on a single test by name. */
    startTest(source: string, testName: string): Promise<any>;
    /** Tear the session down. */
    terminate(): Promise<any>;

    // ── Control ──────────────────────────────────────────────────────────

    continue(): Promise<any>;
    pause(): Promise<any>;
    step(kind: StepKind): Promise<any>;

    // ── Breakpoints ──────────────────────────────────────────────────────

    /** Push the current breakpoint set to the runtime. `payload` is the
     *  runtime-specific request shape that runner.debugSetBreakpoints /
     *  monoGameHost.debugSetBreakpoints already accept. */
    setBreakpoints(payload: any): Promise<any>;

    // ── Inspection (queries that fetch state) ─────────────────────────────

    stackFrames(): Promise<any>;
    scopes(frameId: number): Promise<any>;
    expandVariable(variableId: number): Promise<any>;
    eval(frameId: number, expression: string): Promise<any>;
    repl(frameId: number, code: string): Promise<any>;
    setVariable(frameId: number, variableId: number, rhs: string): Promise<any>;
    /** Resolve a VM instruction index to a source line/column. Null when
     *  there's no active mapping. */
    resolveInstruction(insIndex: number): Promise<ResolvedInstruction | null>;

    // ── State snapshot (cheap reads used to gate UI) ─────────────────────
    // Passive mirrors maintained by the adapter from its event stream.

    readonly status: DebugStatus;
    readonly paused: boolean;
    readonly currentLocation: { file: string; line: number } | null;

    // ── Event subscription ───────────────────────────────────────────────

    /** Subscribe to raw debug events. Returns an unsubscribe function. */
    onDebugEvent(handler: (event: DebugEvent) => void): () => void;
}
