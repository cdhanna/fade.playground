// Schema-mirroring TypeScript types for the playground's fade.json manifest.
// The canonical schema is shipped at public/fade.schema.json so external
// editors can reference it; this file keeps the in-page validator in sync.
//
// Keep these mirrored: if you add a field to fade.schema.json, add it here
// (and to the validator) — the playground doesn't use a JSON Schema runtime
// to keep the bundle small.

export const FADE_JSON_NAME = 'fade.json';

export type FadeProjectType = 'web' | 'monogame';

export interface CommandDllEntry {
    assembly: string;
    class: string;
}

/** Runtime GC tuning, funneled to the VM (see Game1.SetGcSettings). */
export interface FadeGcSettings {
    /** Heap allocations between garbage collections. Higher = fewer
     *  collections + more memory. 0/omitted keeps the VM default (64). */
    sweepInterval?: number;
    /** Diagnostic: poison freed heap memory and never reuse it, so a
     *  use-after-free surfaces immediately. Costs memory; not for shipping. */
    paranoid?: boolean;
}

export interface FadeSettings {
    gc?: FadeGcSettings;
}

export interface FadeProject {
    name: string;
    author?: string;
    /** Free-text project description shown in the workspace picker. */
    description?: string;
    type: FadeProjectType;
    commandDlls?: CommandDllEntry[];
    sources: string[];
    /** Optional runtime settings (GC tuning, …). */
    settings?: FadeSettings;
}

// Validation outcome — either a parsed/typed config or a list of errors
// pinned to JSON pointer paths so the Problems panel can attach decorations
// to specific lines once we add deeper editor integration.
export interface FadeConfigError {
    path: string;        // JSON-pointer-ish, e.g. "sources[2]" or "type"
    message: string;
    severity: 'error' | 'warning';
    // Optional source range, filled in after the locator runs over the
    // text. Drives Monaco squiggles and click-to-jump in Problems.
    range?: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
    };
}

export interface FadeConfigParseResult {
    ok: boolean;
    project?: FadeProject;
    errors: FadeConfigError[];
}

const SOURCE_NAME_RE = /^[\w.\-/]+\.(fbasic|fb)$/;
const ALLOWED_TYPES = new Set<FadeProjectType>(['web', 'monogame']);

// Validate a *parsed* JSON value against the fade.json shape. Returns a
// fully-typed FadeProject only when no `error`-severity issues were found.
export function validateFadeProject(raw: unknown): FadeConfigParseResult {
    const errors: FadeConfigError[] = [];
    const err = (path: string, message: string) =>
        errors.push({ path, message, severity: 'error' });
    const warn = (path: string, message: string) =>
        errors.push({ path, message, severity: 'warning' });

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        err('', 'fade.json root must be a JSON object.');
        return { ok: false, errors };
    }
    const root = raw as Record<string, unknown>;

    // Reject unknown keys so typos surface instead of being silently dropped.
    // `$schema` is permitted (and emitted by stringifyFadeProject) so editors
    // can attach the JSON Schema for inline validation.
    const known = new Set(['$schema', 'name', 'author', 'description', 'type', 'commandDlls', 'sources', 'settings']);
    for (const k of Object.keys(root)) {
        if (!known.has(k)) warn(k, `Unknown property "${k}".`);
    }

    // name (required, non-empty string)
    if (typeof root.name !== 'string' || root.name.length === 0) {
        err('name', 'Property "name" must be a non-empty string.');
    }

    // author (optional string)
    if (root.author !== undefined && typeof root.author !== 'string') {
        err('author', 'Property "author" must be a string.');
    }

    // description (optional string)
    if (root.description !== undefined && typeof root.description !== 'string') {
        err('description', 'Property "description" must be a string.');
    }

    // type (required, enum)
    if (typeof root.type !== 'string') {
        err('type', 'Property "type" must be a string.');
    } else if (!ALLOWED_TYPES.has(root.type as FadeProjectType)) {
        err('type', `Property "type" must be one of: ${[...ALLOWED_TYPES].map((t) => `"${t}"`).join(', ')}.`);
    }

    // commandDlls (optional array of { assembly, class } objects)
    if (root.commandDlls !== undefined) {
        if (!Array.isArray(root.commandDlls)) {
            err('commandDlls', 'Property "commandDlls" must be an array of { assembly, class } objects.');
        } else {
            (root.commandDlls as unknown[]).forEach((v, i) => {
                if (v === null || typeof v !== 'object' || Array.isArray(v)) {
                    err(`commandDlls[${i}]`, 'Each entry must be an object with "assembly" and "class" string properties.');
                    return;
                }
                const entry = v as Record<string, unknown>;
                if (typeof entry.assembly !== 'string' || entry.assembly.length === 0)
                    err(`commandDlls[${i}]`, 'Entry "assembly" must be a non-empty string (assembly name without .dll).');
                if (typeof entry.class !== 'string' || entry.class.length === 0)
                    err(`commandDlls[${i}]`, 'Entry "class" must be a non-empty string (fully-qualified class name).');
            });
        }
    }

    // sources (required, non-empty array of fbasic-looking strings)
    if (!Array.isArray(root.sources) || root.sources.length === 0) {
        err('sources', 'Property "sources" must be a non-empty array of .fbasic file names.');
    } else {
        const seen = new Set<string>();
        (root.sources as unknown[]).forEach((v, i) => {
            if (typeof v !== 'string') {
                err(`sources[${i}]`, 'Each source must be a string.');
                return;
            }
            if (!SOURCE_NAME_RE.test(v)) {
                err(`sources[${i}]`, `"${v}" does not look like a .fbasic file name.`);
            }
            if (seen.has(v)) warn(`sources[${i}]`, `Duplicate source "${v}" is listed earlier.`);
            seen.add(v);
        });
    }

    // settings (optional object; currently just settings.gc)
    let parsedSettings: FadeSettings | undefined;
    if (root.settings !== undefined) {
        if (root.settings === null || typeof root.settings !== 'object' || Array.isArray(root.settings)) {
            err('settings', 'Property "settings" must be an object.');
        } else {
            const s = root.settings as Record<string, unknown>;
            for (const k of Object.keys(s)) {
                if (k !== 'gc') warn(`settings.${k}`, `Unknown settings property "${k}".`);
            }
            if (s.gc !== undefined) {
                if (s.gc === null || typeof s.gc !== 'object' || Array.isArray(s.gc)) {
                    err('settings.gc', 'Property "settings.gc" must be an object.');
                } else {
                    const gc = s.gc as Record<string, unknown>;
                    for (const k of Object.keys(gc)) {
                        if (k !== 'sweepInterval' && k !== 'paranoid')
                            warn(`settings.gc.${k}`, `Unknown gc setting "${k}".`);
                    }
                    if (gc.sweepInterval !== undefined
                        && (typeof gc.sweepInterval !== 'number' || !Number.isInteger(gc.sweepInterval) || gc.sweepInterval < 0)) {
                        err('settings.gc.sweepInterval', 'Property "settings.gc.sweepInterval" must be a non-negative integer (0 = VM default).');
                    }
                    if (gc.paranoid !== undefined && typeof gc.paranoid !== 'boolean') {
                        err('settings.gc.paranoid', 'Property "settings.gc.paranoid" must be a boolean.');
                    }
                    parsedSettings = {
                        gc: {
                            sweepInterval: typeof gc.sweepInterval === 'number' ? gc.sweepInterval : undefined,
                            paranoid: typeof gc.paranoid === 'boolean' ? gc.paranoid : undefined,
                        },
                    };
                }
            }
        }
    }

    const hasErrors = errors.some((e) => e.severity === 'error');
    if (hasErrors) return { ok: false, errors };
    return {
        ok: true,
        project: {
            name: root.name as string,
            author: typeof root.author === 'string' ? root.author : undefined,
            description: typeof root.description === 'string' ? root.description : undefined,
            type: root.type as FadeProjectType,
            commandDlls: Array.isArray(root.commandDlls)
                ? (root.commandDlls as CommandDllEntry[])
                : [],
            sources: root.sources as string[],
            settings: parsedSettings,
        },
        errors, // may still contain warnings
    };
}

// Parse-and-validate from a raw JSON string. Convenience wrapper that
// surfaces JSON syntax errors as schema errors at path "".
export function parseFadeProject(jsonText: string): FadeConfigParseResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch (e: any) {
        return {
            ok: false,
            errors: [{ path: '', message: 'fade.json is not valid JSON: ' + (e?.message ?? e), severity: 'error' }],
        };
    }
    return validateFadeProject(parsed);
}

// Build a default fade.json for a fresh project. Used when migrating legacy
// flat OPFS files into the first project folder, and when creating a new
// project from the project viewer (which now lets the user pick a type).
export function defaultFadeProject(
    projectName: string,
    sources: string[],
    type: FadeProjectType = 'web',
    description?: string,
): FadeProject {
    return {
        name: projectName,
        ...(description ? { description } : {}),
        type,
        commandDlls: [],
        sources: sources.length > 0 ? sources : ['main.fbasic'],
    };
}

// Map JSON-pointer-ish paths ("sources[2]", "type", "$schema") to character
// ranges in the source text. Used to turn validator errors into Monaco
// markers so the user sees a red squiggle on the offending key/value.
//
// The locator is a small hand-rolled tokenizer + state machine — not a full
// JSON parser. It's deliberately tolerant of malformed input: every token it
// can recognize gets recorded, and unknown bytes are skipped. The output is
// a Map keyed by the same path strings the validator emits.

export interface JsonRange { start: number; end: number; }

export function locateJsonPaths(text: string): Map<string, JsonRange> {
    const ranges = new Map<string, JsonRange>();
    let i = 0;
    const n = text.length;
    const stack: Array<{ kind: 'obj' | 'arr'; key?: string; index?: number; parentPath: string }> = [];

    function pathFor(extra?: string): string {
        const top = stack[stack.length - 1];
        if (!top) return extra ?? '';
        const base = top.parentPath;
        if (top.kind === 'obj') {
            const k = extra ?? top.key ?? '';
            if (!k) return base;
            return base ? `${base}.${k}` : k;
        }
        // array
        const idx = top.index ?? 0;
        const seg = `[${idx}]`;
        return base + seg;
    }

    function skipWs() {
        while (i < n) {
            const c = text.charCodeAt(i);
            if (c === 32 || c === 9 || c === 10 || c === 13) { i++; continue; }
            if (c === 47 /* / */ && i + 1 < n) {
                if (text.charCodeAt(i + 1) === 47) {
                    // line comment
                    i += 2;
                    while (i < n && text.charCodeAt(i) !== 10) i++;
                    continue;
                }
                if (text.charCodeAt(i + 1) === 42) {
                    // block comment
                    i += 2;
                    while (i < n - 1 && !(text.charCodeAt(i) === 42 && text.charCodeAt(i + 1) === 47)) i++;
                    i += 2;
                    continue;
                }
            }
            break;
        }
    }

    function readString(): { value: string; range: JsonRange } | null {
        if (text.charCodeAt(i) !== 34 /* " */) return null;
        const start = i;
        i++;
        let value = '';
        while (i < n) {
            const c = text.charCodeAt(i);
            if (c === 92 /* \ */ && i + 1 < n) {
                value += text[i + 1]; i += 2; continue;
            }
            if (c === 34) { i++; return { value, range: { start, end: i } }; }
            value += text[i]; i++;
        }
        return { value, range: { start, end: i } };
    }

    function readLiteralRange(): JsonRange {
        const start = i;
        while (i < n) {
            const c = text.charCodeAt(i);
            // stop on JSON structural chars or whitespace
            if (c === 44 || c === 125 || c === 93 || c === 32 || c === 9 || c === 10 || c === 13) break;
            i++;
        }
        return { start, end: i };
    }

    // Path-segment math we redo after pushing/popping so paths reflect the
    // current container.
    function topParentPath(): string {
        // Path of the enclosing container — the new frame's parentPath.
        return pathFor();
    }

    while (i < n) {
        skipWs();
        if (i >= n) break;
        const c = text.charCodeAt(i);
        // Container opens
        if (c === 123 /* { */) {
            const parentPath = topParentPath();
            stack.push({ kind: 'obj', parentPath });
            i++;
            continue;
        }
        if (c === 91 /* [ */) {
            const parentPath = topParentPath();
            stack.push({ kind: 'arr', index: 0, parentPath });
            i++;
            continue;
        }
        if (c === 125 /* } */ || c === 93 /* ] */) {
            stack.pop();
            i++;
            // After closing a value, parent array (if any) advances its index.
            const top = stack[stack.length - 1];
            if (top?.kind === 'arr') top.index = (top.index ?? 0) + 1;
            else if (top?.kind === 'obj') top.key = undefined;
            continue;
        }
        if (c === 44 /* , */) {
            const top = stack[stack.length - 1];
            if (top?.kind === 'arr') top.index = (top.index ?? 0) + 1;
            else if (top?.kind === 'obj') top.key = undefined;
            i++;
            continue;
        }
        if (c === 58 /* : */) {
            // Colon separates a recorded key from its value; no-op.
            i++;
            continue;
        }
        if (c === 34 /* " */) {
            const s = readString();
            if (!s) break;
            const top = stack[stack.length - 1];
            // In an object, alternating: first string is a key.
            if (top?.kind === 'obj' && top.key === undefined) {
                top.key = s.value;
                // Record the key range first; the value will overwrite if
                // present (validators usually target the value).
                ranges.set(pathFor(), s.range);
                continue;
            }
            // Otherwise it's a value (in array or as a value-of-key).
            const valuePath = pathFor();
            if (valuePath) ranges.set(valuePath, s.range);
            continue;
        }
        // Literals: number, true, false, null
        const range = readLiteralRange();
        if (range.end > range.start) {
            const valuePath = pathFor();
            if (valuePath) ranges.set(valuePath, range);
        } else {
            i++; // safety: don't hang on unknown char
        }
    }
    return ranges;
}

// Convert a (start,end) byte range into a Monaco (line,col) range. Single
// pass over the text; returns 1-based line/col tuples ready for setModelMarkers.
export function offsetsToLineCol(text: string, start: number, end: number): {
    startLineNumber: number; startColumn: number;
    endLineNumber: number; endColumn: number;
} {
    let line = 1, col = 1;
    let startLine = 1, startCol = 1, endLine = 1, endCol = 1;
    const target = Math.max(0, Math.min(text.length, end));
    for (let i = 0; i <= text.length; i++) {
        if (i === start) { startLine = line; startCol = col; }
        if (i === target) { endLine = line; endCol = col; }
        if (i >= target) break;
        if (text.charCodeAt(i) === 10) { line++; col = 1; } else { col++; }
    }
    return { startLineNumber: startLine, startColumn: startCol, endLineNumber: endLine, endColumn: endCol };
}

// Stable pretty-printer so saving fade.json from a form keeps a consistent
// shape on disk (no key drift, no whitespace churn).
export function stringifyFadeProject(p: FadeProject): string {
    const ordered: Record<string, unknown> = {
        $schema: '/fade.schema.json',
        name: p.name,
    };
    if (p.author) ordered.author = p.author;
    if (p.description) ordered.description = p.description;
    ordered.type = p.type;
    ordered.commandDlls = p.commandDlls ?? [];
    ordered.sources = p.sources;
    // Only emit settings when the block carries a value, so untouched projects
    // don't grow an empty `settings: {}`.
    if (p.settings?.gc && (p.settings.gc.sweepInterval !== undefined || p.settings.gc.paranoid !== undefined)) {
        const gc: Record<string, unknown> = {};
        if (p.settings.gc.sweepInterval !== undefined) gc.sweepInterval = p.settings.gc.sweepInterval;
        if (p.settings.gc.paranoid !== undefined) gc.paranoid = p.settings.gc.paranoid;
        ordered.settings = { gc };
    }
    return JSON.stringify(ordered, null, 2) + '\n';
}
