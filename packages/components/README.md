# @fadebasic/components

Framework-agnostic web components built on `@fadebasic/editor` +
`@fadebasic/runtime`:

- `<fade-editor>` — editor with optional `readonly` (highlight-only) mode.
- `<fade-runnable>` — editor + Run + output; `debug` attribute adds debug UI.
- Debug views: `<fade-debug-toolbar>`, `<fade-variables>`, `<fade-watch>`,
  `<fade-call-stack>`, `<fade-breakpoints>`, `<fade-debug-console>`.

Code is accepted as a `code` property (safe for generated pages) as well as
slotted text.

**Status: scaffold.** Implemented in Phase 4 of
[docs/embeddable-components-proposal.md](../../docs/embeddable-components-proposal.md).
