// Editor navigation history — the "go back / go forward" stack, modeled on
// VSCode's IHistoryService (which we can't use — see the standalone-editor +
// custom-tabs design). It's a browser-style history: a current location plus a
// Back stack and a Forward stack, so both directions work and a fresh jump
// truncates the forward history.
//
// The consumer (main.ts) feeds it two kinds of signal:
//   • `visit(loc)` for ORGANIC movement — cursor moves and file switches. The
//     class itself decides whether that's a "jump" worth a history entry or a
//     small move within the current area (which just keeps the current entry
//     fresh, no new entry). This is what keeps typing/small clicks from
//     flooding the history.
//   • `goBack()` / `goForward()` return the location to navigate to; the caller
//     performs the navigation with recording suppressed.

export interface NavLocation {
    /** Workspace-relative file name (the tab key), e.g. `code/main.fbasic`. */
    name: string;
    /** 1-based Monaco line. */
    lineNumber: number;
    /** 1-based Monaco column. */
    column: number;
}

/** A cursor move within this many lines of the current location is treated as
 *  the "same place" — no new history entry. Matches VSCode's ~10-line rule and
 *  is what stops typing / small clicks from stacking entries. */
export const SAME_AREA_LINE_THRESHOLD = 10;

function sameArea(a: NavLocation, b: NavLocation): boolean {
    return a.name === b.name && Math.abs(a.lineNumber - b.lineNumber) <= SAME_AREA_LINE_THRESHOLD;
}

export class NavigationHistory {
    private backStack: NavLocation[] = [];
    private forwardStack: NavLocation[] = [];
    private current: NavLocation | null = null;
    private readonly max: number;

    /** Fired when Back/Forward availability may have changed — the UI uses it
     *  to enable/disable the arrow buttons. Not fired for same-area merges
     *  (availability is unchanged there). */
    onChange: () => void = () => {};

    constructor(max = 60) {
        this.max = max;
    }

    /** Organic movement to `loc`. If it's far from (or in a different file
     *  than) the current location it's a JUMP: the previous location is pushed
     *  onto Back and the Forward history is dropped. Otherwise it's a small move
     *  and only refreshes the current position. */
    visit(loc: NavLocation): void {
        const prev = this.current;
        if (prev && sameArea(prev, loc)) {
            this.current = loc; // keep current fresh; not a new entry
            return;
        }
        if (prev) {
            this.backStack.push(prev);
            if (this.backStack.length > this.max) this.backStack.shift();
        }
        this.forwardStack = [];
        this.current = loc;
        this.onChange();
    }

    canGoBack(): boolean {
        return this.backStack.length > 0;
    }

    canGoForward(): boolean {
        return this.forwardStack.length > 0;
    }

    /** Where we currently are (or null before the first visit). */
    getCurrent(): NavLocation | null {
        return this.current;
    }

    /** Pop the Back stack; the current location moves to Forward. Returns the
     *  location the caller should navigate to, or null when Back is empty. */
    goBack(): NavLocation | null {
        const target = this.backStack.pop();
        if (!target) return null;
        if (this.current) this.forwardStack.push(this.current);
        this.current = target;
        this.onChange();
        return target;
    }

    /** Symmetric to goBack. */
    goForward(): NavLocation | null {
        const target = this.forwardStack.pop();
        if (!target) return null;
        if (this.current) this.backStack.push(this.current);
        this.current = target;
        this.onChange();
        return target;
    }

    /** Drop every entry for a file (closed / deleted) so Back/Forward never
     *  navigate to a file that's gone. */
    forget(name: string): void {
        const before = this.backStack.length + this.forwardStack.length;
        this.backStack = this.backStack.filter((e) => e.name !== name);
        this.forwardStack = this.forwardStack.filter((e) => e.name !== name);
        if (this.current?.name === name) this.current = null;
        if (before !== this.backStack.length + this.forwardStack.length) this.onChange();
    }

    /** Re-point entries when a file OR folder is renamed/moved so history
     *  survives it. Handles the exact file (`a.fbasic` → `b.fbasic`) and every
     *  file under a moved folder (`old/x` → `new/x`). */
    rename(oldName: string, newName: string): void {
        const prefix = oldName + '/';
        const fix = (e: NavLocation): NavLocation => {
            if (e.name === oldName) return { ...e, name: newName };
            if (e.name.startsWith(prefix)) return { ...e, name: newName + '/' + e.name.slice(prefix.length) };
            return e;
        };
        this.backStack = this.backStack.map(fix);
        this.forwardStack = this.forwardStack.map(fix);
        if (this.current) this.current = fix(this.current);
    }
}
