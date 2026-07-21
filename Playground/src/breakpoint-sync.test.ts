import { describe, it, expect } from 'vitest';
import { joinedBreakpointLines } from './breakpoint-sync';
import { ProjectSourceMap } from './project-source-map';

describe('joinedBreakpointLines', () => {
    // Three files, each ending in a newline. Joined line ranges:
    //   a.fbasic → [0, 3)   (3 lines)
    //   big.fbasic → [3, 8)  (5 lines, e.g. a long multi-line string)
    //   c.fbasic → [8, 10)  (2 lines)
    const map = ProjectSourceMap.build([
        { name: 'a.fbasic', text: 'a1\na2\na3\n' },
        { name: 'big.fbasic', text: 's$ = "l1"\n+ "l2"\n+ "l3"\n+ "l4"\n+ "l5"\n' },
        { name: 'c.fbasic', text: 'c1\nc2\n' },
    ]);
    const toJoined = (name: string, line: number) => map.toProject(name, line, 0)?.line ?? null;

    it('maps a breakpoint in the first file to itself', () => {
        // Monaco line 2 in a.fbasic → joined 0-based line 1.
        expect(joinedBreakpointLines([{ name: 'a.fbasic', lines: [2] }], toJoined)).toEqual([1]);
    });

    // The regression: without the source-map translation the runtime got the
    // raw per-file line and broke on the wrong line (or a line inside an
    // earlier file). Monaco line 2 in big.fbasic is joined 0-based line 4,
    // NOT line 1.
    it('offsets a breakpoint in the second file by the first file’s length', () => {
        expect(joinedBreakpointLines([{ name: 'big.fbasic', lines: [2] }], toJoined)).toEqual([4]);
        // The naive (buggy) behaviour would have produced line 1.
        expect(joinedBreakpointLines([{ name: 'big.fbasic', lines: [2] }], toJoined)).not.toEqual([1]);
    });

    it('maps breakpoints across every file, sorted and de-duplicated', () => {
        const out = joinedBreakpointLines([
            { name: 'c.fbasic', lines: [1] },      // → joined 8
            { name: 'a.fbasic', lines: [1, 3] },   // → joined 0, 2
            { name: 'big.fbasic', lines: [5] },    // → joined 7
        ], toJoined);
        expect(out).toEqual([0, 2, 7, 8]);
    });

    it('falls back to the raw 0-based line when the file is not in the map (single-file)', () => {
        const passthrough = () => null;
        expect(joinedBreakpointLines([{ name: 'orphan.fbasic', lines: [1, 5] }], passthrough))
            .toEqual([0, 4]);
    });
});
