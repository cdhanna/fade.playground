// The debug adapter contract now lives in @fadebasic/runtime (the DOM-free
// runtime client package) so it can be shared by the embeddable component
// library. This module re-exports it unchanged, so existing imports of
// `./adapter` across the Playground keep working while the source of truth
// moves into the package.
//
// See docs/embeddable-components-proposal.md (Phase 2).

export type {
    DebugStatus,
    StepKind,
    DebugEvent,
    ResolvedInstruction,
    DebugAdapter,
} from '@fadebasic/runtime';
