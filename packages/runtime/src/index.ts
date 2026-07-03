// @fadebasic/runtime — DOM-free client for the FadeBasic runtime.
//
// Phase 2 (in progress): the debug contract and the wire-protocol DTOs are
// extracted first; the FadeRunner transport client (LSP worker + VM iframe
// protocol) follows.

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
} from './protocol';
