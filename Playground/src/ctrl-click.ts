// Ctrl/Cmd-click resolution for the fbasic editor.
//
// The mental model is: "Ctrl/Cmd-click always goes to the definition of
// the thing under the cursor."
//   • A variable, type, user-defined function or label lives *in the
//     program*, so we jump to its source location (Monaco's built-in
//     go-to-definition, driven by our DefinitionProvider, handles this).
//   • A built-in command or a language keyword has no source location —
//     its "definition" is the documentation, so we open the docs.
//
// The regression this guards against: the docs path used to fire for
// *any* word, so Ctrl-clicking a user symbol that already has a valid
// go-to-definition target would ALSO pop the help panel open. Gating the
// docs path on "no in-program definition exists" keeps the two worlds
// separate — program symbols go to source, everything else goes to docs.

export type CtrlClickAction =
    /** Symbol has an in-program definition — let go-to-definition handle
     *  it; the docs must NOT open. */
    | 'definition'
    /** Built-in command — open its help entry. */
    | 'command-doc'
    /** Language keyword / unmapped word — route through the docs
     *  (keyword jump, falling back to help search). */
    | 'keyword-doc'
    /** Nothing actionable under the cursor. */
    | 'none';

export interface CtrlClickResolution {
    /** True when the LSP returns a source location for the clicked
     *  position (i.e. it's a variable/type/user function/label). */
    hasProgramDefinition: boolean;
    /** Canonical built-in command name resolved from the hover, or null. */
    commandName: string | null;
    /** True when the word is a documented language keyword (`if`, `for`,
     *  `dim`, a primitive-type name, …). ONLY commands and keywords route to
     *  the docs — an unrecognized word (an unresolved variable/function/label,
     *  or a typo) must NOT trigger a help lookup. */
    isKeyword: boolean;
    /** The word under the cursor, or null when there isn't one. */
    word: string | null;
}

/** Decide what a Ctrl/Cmd-click should do, given what resolution found at
 *  the clicked position. Priority order matters: an in-program definition
 *  always wins over the docs so go-to-definition is never shadowed. A word
 *  that is neither a command nor a keyword falls through to `none` — variables,
 *  functions and labels never start a help search, even when the LSP didn't
 *  return a definition for them (e.g. an unresolved reference). */
export function resolveCtrlClickAction(r: CtrlClickResolution): CtrlClickAction {
    if (r.hasProgramDefinition) return 'definition';
    if (r.commandName) return 'command-doc';
    if (r.isKeyword) return 'keyword-doc';
    return 'none';
}
