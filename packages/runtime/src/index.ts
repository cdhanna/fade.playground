// @fadebasic/runtime — DOM-free client for the FadeBasic runtime.
//
// Phase 2 (in progress): the debug contract is extracted first; the
// FadeRunner transport client (LSP worker + VM iframe protocol) follows.
export type {
    DebugStatus,
    StepKind,
    DebugEvent,
    ResolvedInstruction,
    DebugAdapter,
} from './debug-protocol';
