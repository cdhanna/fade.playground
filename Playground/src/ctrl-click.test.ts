import { describe, it, expect } from 'vitest';
import { resolveCtrlClickAction } from './ctrl-click';

describe('resolveCtrlClickAction', () => {
    // The core regression: a user-defined symbol (variable, type,
    // function, label) has an in-program definition, so Ctrl+click must
    // go to that definition and NOT open the docs — even though the word
    // would otherwise be routed to the help panel via keyword search.
    it('goes to definition for an in-program symbol and does not open docs', () => {
        expect(resolveCtrlClickAction({
            hasProgramDefinition: true,
            commandName: null,
            isKeyword: false,
            word: 'myVariable',
        })).toBe('definition');
    });

    // Even if a word happens to also resolve to a command name / keyword,
    // an in-program definition still wins — go-to-definition is never
    // shadowed by the docs path.
    it('prefers the in-program definition over any docs match', () => {
        expect(resolveCtrlClickAction({
            hasProgramDefinition: true,
            commandName: 'print',
            isKeyword: false,
            word: 'print',
        })).toBe('definition');
    });

    // Built-in commands have no source location; their docs are the
    // definition.
    it('opens the command doc for a built-in command with no program definition', () => {
        expect(resolveCtrlClickAction({
            hasProgramDefinition: false,
            commandName: 'position sprite',
            isKeyword: false,
            word: 'position',
        })).toBe('command-doc');
    });

    // Language keywords (if/for/dim/function/...) aren't commands and
    // have no program definition; route them to the docs.
    it('routes a keyword with no program definition to the docs', () => {
        expect(resolveCtrlClickAction({
            hasProgramDefinition: false,
            commandName: null,
            isKeyword: true,
            word: 'function',
        })).toBe('keyword-doc');
    });

    // The behavior this file guards: an UNRESOLVED variable/function/label —
    // no definition, not a command, not a keyword — must NOT fall through to a
    // help search. It's `none`, so Ctrl+click does nothing rather than popping
    // the help panel open on a plain identifier.
    it('does nothing for an unrecognized word (unresolved variable/function/label)', () => {
        expect(resolveCtrlClickAction({
            hasProgramDefinition: false,
            commandName: null,
            isKeyword: false,
            word: 'someLocalVar',
        })).toBe('none');
    });

    it('does nothing when there is no word and nothing resolves', () => {
        expect(resolveCtrlClickAction({
            hasProgramDefinition: false,
            commandName: null,
            isKeyword: false,
            word: null,
        })).toBe('none');
    });
});
