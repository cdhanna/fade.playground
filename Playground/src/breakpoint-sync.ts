// Translate per-file editor breakpoints into the joined-document line
// numbers the compiled program uses.
//
// A multi-file Fade project is compiled as ONE joined document (see
// project-source-map.ts): file A occupies joined lines [0, aLen), file B
// [aLen, aLen+bLen), and so on. The debugger runs that joined program, so
// its breakpoints and stack frames speak joined-line coordinates.
//
// Breakpoints, though, are stored per-file in editor (Monaco) coordinates,
// which are 1-based and local to each file. Sending a file-B breakpoint at
// its raw local line makes the runtime break at that line *of the joined
// document* — i.e. somewhere in file A — so it fires on the wrong line, or
// never. Every breakpoint must be mapped through the source map's forward
// (per-file → joined) transform first. This module isolates that math so
// it can be unit-tested without the editor/runtime.

export interface FileBreakpoints {
    /** Project-relative source name, as keyed in the source map. */
    name: string;
    /** 1-based Monaco line numbers with breakpoints in this file. */
    lines: number[];
}

/** Forward map: per-file 0-based line → joined 0-based line, or null when
 *  the file isn't part of the joined document. Backed by
 *  ProjectSourceMap.toProject in production. */
export type ToJoinedLine = (name: string, zeroBasedLine: number) => number | null;

/** Collect the sorted, de-duplicated set of joined 0-based line numbers to
 *  hand the debugger, given per-file breakpoints and a forward mapper.
 *  A line whose file can't be mapped falls back to its own 0-based value
 *  (correct for the single-file / no-project case). */
export function joinedBreakpointLines(
    files: FileBreakpoints[],
    toJoined: ToJoinedLine,
): number[] {
    const out = new Set<number>();
    for (const f of files) {
        for (const monacoLine of f.lines) {
            const zeroBased = monacoLine - 1;
            const joined = toJoined(f.name, zeroBased);
            out.add(joined ?? zeroBased);
        }
    }
    return [...out].sort((a, b) => a - b);
}
