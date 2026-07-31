import { describe, it, expect } from 'vitest';
import { NavigationHistory, type NavLocation } from './navigation-history';

const loc = (name: string, lineNumber: number, column = 1): NavLocation => ({ name, lineNumber, column });

describe('NavigationHistory', () => {
    it('starts empty', () => {
        const h = new NavigationHistory();
        expect(h.canGoBack()).toBe(false);
        expect(h.canGoForward()).toBe(false);
        expect(h.goBack()).toBeNull();
        expect(h.goForward()).toBeNull();
    });

    it('does not create an entry for the first visit', () => {
        const h = new NavigationHistory();
        h.visit(loc('a.fbasic', 10));
        expect(h.canGoBack()).toBe(false);
        expect(h.getCurrent()).toEqual(loc('a.fbasic', 10));
    });

    it('treats a small in-file move as the same place (no back entry)', () => {
        const h = new NavigationHistory();
        h.visit(loc('a.fbasic', 10));
        h.visit(loc('a.fbasic', 12)); // within threshold
        expect(h.canGoBack()).toBe(false);
        expect(h.getCurrent()).toEqual(loc('a.fbasic', 12));
    });

    it('treats a far in-file jump as a new entry', () => {
        const h = new NavigationHistory();
        h.visit(loc('a.fbasic', 10));
        h.visit(loc('a.fbasic', 200));
        expect(h.canGoBack()).toBe(true);
        expect(h.goBack()).toEqual(loc('a.fbasic', 10));
    });

    it('treats a file switch as a jump regardless of line proximity', () => {
        const h = new NavigationHistory();
        h.visit(loc('a.fbasic', 10));
        h.visit(loc('b.fbasic', 10)); // same line number, different file
        expect(h.canGoBack()).toBe(true);
        expect(h.goBack()).toEqual(loc('a.fbasic', 10));
    });

    it('goes back and forward across several jumps', () => {
        const h = new NavigationHistory();
        h.visit(loc('a.fbasic', 1));
        h.visit(loc('b.fbasic', 1));
        h.visit(loc('c.fbasic', 1));
        // At C. Back → B → A.
        expect(h.goBack()).toEqual(loc('b.fbasic', 1));
        expect(h.goBack()).toEqual(loc('a.fbasic', 1));
        expect(h.canGoBack()).toBe(false);
        // Forward → B → C.
        expect(h.goForward()).toEqual(loc('b.fbasic', 1));
        expect(h.goForward()).toEqual(loc('c.fbasic', 1));
        expect(h.canGoForward()).toBe(false);
    });

    it('truncates forward history when a new jump happens mid-stack', () => {
        const h = new NavigationHistory();
        h.visit(loc('a.fbasic', 1));
        h.visit(loc('b.fbasic', 1));
        h.visit(loc('c.fbasic', 1));
        h.goBack(); // now at B, forward = [C]
        expect(h.canGoForward()).toBe(true);
        h.visit(loc('d.fbasic', 1)); // new jump from B
        expect(h.canGoForward()).toBe(false); // C dropped
        expect(h.goBack()).toEqual(loc('b.fbasic', 1));
        expect(h.goBack()).toEqual(loc('a.fbasic', 1));
    });

    it('a same-area visit after goBack does not push a new entry (self-correcting navigation)', () => {
        // This is what lets a programmatic navigation-to-target re-trigger a
        // visit without corrupting the stack: navigating to the entry we just
        // moved to is a same-place visit.
        const h = new NavigationHistory();
        h.visit(loc('a.fbasic', 1));
        h.visit(loc('b.fbasic', 50));
        const target = h.goBack(); // → A:1
        expect(target).toEqual(loc('a.fbasic', 1));
        h.visit(loc('a.fbasic', 1)); // navigation settled here
        expect(h.canGoForward()).toBe(true); // B still reachable
        expect(h.goForward()).toEqual(loc('b.fbasic', 50));
    });

    it('caps the back stack at max', () => {
        const h = new NavigationHistory(3);
        for (let i = 0; i < 10; i++) h.visit(loc('f.fbasic', i * 100));
        // Only the last 3 jumps are retained.
        let count = 0;
        while (h.goBack()) count++;
        expect(count).toBe(3);
    });

    it('forget() drops entries for a closed/deleted file', () => {
        const h = new NavigationHistory();
        h.visit(loc('a.fbasic', 1));
        h.visit(loc('b.fbasic', 1));
        h.visit(loc('a.fbasic', 100));
        h.forget('a.fbasic');
        // Only B remains reachable.
        const seen: string[] = [];
        let e = h.goBack();
        while (e) { seen.push(e.name); e = h.goBack(); }
        expect(seen).toEqual(['b.fbasic']);
    });

    it('rename() re-points an exact file entry', () => {
        const h = new NavigationHistory();
        h.visit(loc('old.fbasic', 1));
        h.visit(loc('b.fbasic', 1));
        h.rename('old.fbasic', 'new.fbasic');
        expect(h.goBack()).toEqual(loc('new.fbasic', 1));
    });

    it('rename() re-points files under a moved folder (prefix)', () => {
        const h = new NavigationHistory();
        h.visit(loc('code/a.fbasic', 5));
        h.visit(loc('other.fbasic', 1));
        h.rename('code', 'src'); // folder move
        expect(h.goBack()).toEqual(loc('src/a.fbasic', 5));
    });

    it('fires onChange on jumps and navigation but not on same-area moves', () => {
        const h = new NavigationHistory();
        let changes = 0;
        h.onChange = () => { changes++; };
        h.visit(loc('a.fbasic', 1));  // first jump (prev null → still counts as onChange)
        h.visit(loc('a.fbasic', 3));  // same area → no onChange
        h.visit(loc('b.fbasic', 1));  // jump → onChange
        h.goBack();                    // → onChange
        expect(changes).toBe(3);
    });
});
