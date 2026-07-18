// Wire-format DTOs for the FadeBasic runtime protocol — the shapes exchanged
// with the LSP worker and the VM iframe. camelCase to match the JSON emitted
// by FadeBasic.LSP.Core.* / FadeBasic.Export.Web / FadeBasic.Launch.
//
// Extracted verbatim from the Playground's main.ts so the runtime client
// (FadeRunner, Phase 2b) and the embeddable editor/components can share one
// source of truth. DOM-free.

/** Callbacks + config the runtime client is constructed with. */
export interface RunnerOpts {
    onPrint: (line: string) => void;
    onAlert: (msg: string) => void;
    onHeartbeat?: (role: 'lsp' | 'vm', tick: number, t: number) => void;
    /** Base URL the runtime assets are served from (must end with '/').
     *  The LSP worker is loaded from `${assetBase}web/worker.js`. Defaults to
     *  '/runtime/' — where the Playground stages them. Embeds that self-host
     *  the assets elsewhere (e.g. fadebasic.com/fade/) override this. */
    assetBase?: string;
}

/** A syntax-highlight token from the LSP's snippet tokenizer. */
export interface SnippetToken {
    line: number;
    col: number;
    length: number;
    type: number;
}

export interface Diagnostic {
    severity: number;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    message: string;
    code: string;
    source: string;
}

// ─── LSP DTOs (match FadeBasic.LSP.Core.* camelCase JSON) ────────────────────
export interface DocSymbol {
    name: string;
    detail: string;
    kind: number;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } };
    children: DocSymbol[] | null;
}
export interface FoldingRange {
    startLine: number;
    endLine: number;
    startCharacter: number | null;
    endCharacter: number | null;
    kind: number;
}
export interface TextEdit {
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    newText: string;
}
export interface WorkspaceEdit {
    changes: { [uri: string]: TextEdit[] };
}
export interface FormattingOptions {
    tabSize: number;
    insertSpaces: boolean;
    casing: number; // 0=Ignore, 1=ToUpper, 2=ToLower
}
export interface TestEntry {
    name: string;
    isAbstract: boolean;
    fromParent: string | null;
    sourceLine: number;
    sourceChar: number;
}
// One entry per uniquely-named command; shape matches what
// `FadeBridge.ListCommandDocs()` emits. The markdown field is the same text
// the hover provider renders; the Help tab reuses it verbatim.
export interface CommandDocEntry {
    name: string;
    signature: string;
    group: string;
    markdown: string;
}
export interface FailureFrame {
    functionName: string;
    lineNumber: number;     // 0-based, as emitted by the lexer
    charNumber: number;
    instructionIndex: number;
}
export interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    failureMessage: string | null;
    failureReason: string | null;
    failureSourceText: string | null;
    failureInstructionIndex?: number;
    failureFrames?: FailureFrame[];
}
export interface TestRunResult {
    passed: number;
    failed: number;
    duration: number;
    results: TestResult[];
    printed: string;
    error?: string;
}

// ─── Debug session DTOs (match FadeBasic.Launch types over the wire) ────
export interface DebugStartResult {
    ok: boolean;
    error?: string;
    statementLines: number[];
}
// Hot-reload verdict envelope (matches FadeBasic's PumpStartResult JSON).
// verdict ∈ NoChange | ApplicableNow | PendingTransient | PermanentlyRude.
export interface ReloadResult {
    ok: boolean;
    verdict?: string;
    rudeReason?: string;
    compileError?: string;
    error?: string;
}
export interface BreakpointRequest {
    // Matches FadeBasic.Export.Web's BreakpointRequestDto (camelCase JSON).
    // 0-based line numbers — the coordinate space the lexer's tokens use.
    line: number;
    column: number;
}
export interface DebugStackFrame {
    name: string;
    lineNumber: number;
    colNumber: number;
}
export interface DebugVariable {
    id: number;
    name: string;
    type: string;
    value: string;
    evalName: string;
    fieldCount: number;
    elementCount: number;
}
export interface DebugScope {
    id: number;
    scopeName: string;
    evalName: string;
    variables: DebugVariable[];
}
export interface DebugScopesResult {
    scopes: DebugScope[];
}
// Mirrors FadeBasic.Launch.DebugEvalResult — note there's NO `failed`
// boolean. Convention: `id === -1` means the eval failed and `value` carries
// the error message; a successful eval returns text in `value` and id >= 0.
export interface DebugEvalResult {
    id: number;
    value: string;
    type?: string;
    fieldCount?: number;
    elementCount?: number;
}

// Wire-format events emitted by the worker's debug-tick loop. `type` is the
// DebugMessageType enum name from C# (uppercase snake) or a synthetic
// 'complete' / 'error'. Kept open (index signature) so runner-side and
// monogame-side variants don't need their full schema centralised here — this
// is the single canonical DebugEvent shared with the debug adapter contract.
export interface DebugEvent {
    type: string;
    id?: number;
    json?: string;
    message?: string;
    [key: string]: unknown;
}

// Matches FadeBasic.LSP.Core.Handlers.LspSignatureHelp shape.
export interface SignatureParam { label: string; documentation: string | null }
export interface SignatureInformation {
    label: string;
    documentation: string | null;
    parameters: SignatureParam[];
    activeParameter: number;
}
export interface SignatureHelp {
    signatures: SignatureInformation[];
    activeSignature: number;
    activeParameter: number;
}

export interface Location {
    uri: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface HoverInfo {
    contents: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

// Matches FadeBasic.LSP.Core.LspCompletionItem shape (camelCase JSON).
export interface CompletionItem {
    label: string;
    insertText: string;
    kind: number;
    detail: string;
    documentation: string;
    sortText: string;
    filterText: string;
    insertTextFormat: number;
    triggerParameterHints: boolean;
}
