// @fadebasic/runtime — DOM-free client for the FadeBasic runtime.
//
// The FadeRunner transport client (LSP worker + VM iframe + debug protocol),
// the debug adapter contract, and the wire-protocol DTOs.

export { FadeRunner } from './runner';

// Debug adapter contract.
export type {
    DebugStatus,
    StepKind,
    ResolvedInstruction,
    DebugAdapter,
} from './debug-protocol';

// Wire-protocol DTOs (LSP + runtime + debug results), incl. the canonical
// DebugEvent.
export type {
    RunnerOpts,
    Diagnostic,
    DocSymbol,
    FoldingRange,
    TextEdit,
    WorkspaceEdit,
    FormattingOptions,
    TestEntry,
    CommandDocEntry,
    FailureFrame,
    TestResult,
    TestRunResult,
    DebugStartResult,
    ReloadResult,
    BreakpointRequest,
    DebugStackFrame,
    DebugVariable,
    DebugScope,
    DebugScopesResult,
    DebugEvalResult,
    DebugEvent,
    SignatureParam,
    SignatureInformation,
    SignatureHelp,
    Location,
    HoverInfo,
    CompletionItem,
    SnippetToken,
} from './protocol';
