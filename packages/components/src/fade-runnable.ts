// <fade-runnable> — an editable Fade snippet with Run + output, and (with the
// `debug` attribute) a VSCode-style debugger: breakpoint gutter, codicon step
// controls, Variables (editable) / Watch / Call Stack / Breakpoints, a combined
// Output + Debug Console, and debug-value hovers.
//
// Layouts: default (stacked) or layout="ide" (a mini VSCode — debugger sidebar
// left, editor right, Output/Console bottom, step strip top-right).
//
// Source: `code` property, `code` attribute, or slotted text. Attributes:
// asset-base, readonly, autorun, no-run, debug, layout, watch.

import '@vscode/codicons/dist/codicon.css';
import { FadeRunner, type TestEntry } from '@fadebasic/runtime';
import { createFadeEditor, setDebugHoverEvaluator, showCrashOverlay, hideCrashOverlay, summarizeCrash, extractInsIndex, type FadeEditor } from '@fadebasic/editor';
import { armWebPreview } from './web-preview';
import { armMonoGamePreview } from './monogame-preview';
import { getSharedRunner, getLspReady, getMonoLspReady } from './runner-pool';
import { FADE_THEME_PRESETS, applyFadeTheme, getFadeTheme } from './theme';

interface StackFrame { name: string; lineNumber: number; colNumber: number }
interface DbgVar { id: number; name: string; type?: string; value: string; fieldCount?: number; elementCount?: number }

export class FadeRunnableElement extends HTMLElement {
    private runner?: FadeRunner;
    private fadeEditor?: FadeEditor;
    private iframe?: HTMLIFrameElement;
    private statusEl?: HTMLElement;
    private runBtn?: HTMLButtonElement;
    private reloadBtn?: HTMLButtonElement;
    private runningSource = '';           // source of the currently-running program
    private armed = false;
    private armingPromise?: Promise<void>;
    private running = false;
    private mono = false;                 // runtime="monogame": run/debug on the KNI canvas
    private _code?: string;
    private ide = false;

    private debugEnabled = false;
    private hideRun = false;
    private debugging = false;
    private paused = false;
    private fatal = false;
    private breakpoints = new Set<number>();
    private frames: StackFrame[] = [];
    private activeFrame = 0;
    private watches: string[] = [];
    private debugBar?: HTMLElement;
    private debugBtn?: HTMLButtonElement;
    private compileErrors = 0;
    private stepBtns: HTMLButtonElement[] = [];
    private tests: TestEntry[] = [];
    private debugTestName?: string;       // the test being debugged (for pass/fail reporting)
    private lastTestScan = '';            // signature of the source's TEST lines last scanned
    private renderedTestSig = '';         // signature of the test names currently rendered
    private testControls?: HTMLElement;   // [Debug test ▾] split button
    private testMenu?: HTMLElement;       // dropdown of debug targets
    private primaryKey = '';              // selected split-button action (defaults to first test)
    private varsBody?: HTMLElement;
    private expandedVars = new Set<number>();
    private watchBody?: HTMLElement;
    private framesBody?: HTMLElement;
    private bpBody?: HTMLElement;
    private replLog?: HTMLElement;
    private replInput?: HTMLInputElement;
    private floatCanvas?: HTMLElement;    // MonoGame: fixed bottom-right game window

    get code(): string { return this.fadeEditor?.getValue() ?? this._code ?? ''; }
    set code(v: string) { this._code = v; if (this.fadeEditor) this.fadeEditor.setValue(v); }

    connectedCallback(): void {
        if (this.fadeEditor) return;
        injectStyles();
        const source = this._code ?? this.getAttribute('code') ?? dedent(this.textContent ?? '');
        const assetBase = this.getAttribute('asset-base') ?? '/runtime/';
        const readonly = this.hasAttribute('readonly');
        const noRun = this.hasAttribute('no-run');
        // `runtime="monogame"`: run/debug on the KNI/Blazor game canvas. It
        // speaks the same VM protocol as the web runtime, so the full IDE
        // (breakpoints, stepping, variables) works — the only difference is the
        // output is a canvas (placed right of the editor). The web LSP doesn't
        // know game commands, so diagnostics are disabled (see below).
        this.mono = this.getAttribute('runtime') === 'monogame';
        this.debugEnabled = this.hasAttribute('debug') && !noRun && !readonly;
        this.ide = this.debugEnabled && this.getAttribute('layout') === 'ide';
        if (this.mono) this.classList.add('fade-runnable--mono');
        this.watches = (this.getAttribute('watch') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

        // `hint`: surface contextual guidance as a leading comment line inside
        // the editor (rather than a separate banner), so it reads as part of the
        // program. `break-last` (opt-in) seeds a breakpoint on the last runnable
        // line and adds a trailing blank line to edit into.
        const hint = this.getAttribute('hint');
        const breakLast = this.hasAttribute('break-last') && this.debugEnabled;
        let value = source;
        // The hint may arrive pre-wrapped (newlines); comment each line so a long
        // nudge becomes several short comment lines rather than one runaway line.
        if (hint) value = hint.split('\n').map((l) => '` ' + l).join('\n') + '\n' + value;
        if (breakLast && !value.endsWith('\n')) value += '\n';

        this.textContent = '';
        this.classList.add('fade-runnable');
        if (this.ide) this.classList.add('fade-runnable--ide');

        const editorHost = el('div', 'fade-runnable__editor');
        const toolbar = el('div', 'fade-runnable__toolbar');
        this.statusEl = el('div', 'fade-runnable__status');

        this.runner = getSharedRunner(assetBase, this.mono ? 'monogame' : 'web');
        this.fadeEditor = createFadeEditor(editorHost, {
            runner: this.runner, value, readonly,
            // Live diagnostics (red squiggles). MonoGame gets its own LSP worker
            // (Standard + FadeMonoGame commands, no Web — see getMonoLspReady), so
            // game commands validate accurately without the false 'ambiguous'
            // errors a mixed command set would produce.
            diagnostics: !readonly, glyphMargin: this.debugEnabled,
            // MonoGame components additionally register the game command set so
            // commands tokenize as commands (purple), not identifiers (blue).
            lspReady: this.mono ? getMonoLspReady(this.runner, assetBase) : getLspReady(this.runner, assetBase),
            onDiagnostics: (errors) => this.onDiagnostics(errors),
        });

        this.runBtn = iconBtn('fade-runnable__btn fade-runnable__btn--primary', 'play', 'Run', 'Run (⌘R)', () => void this.run());
        // Reload button — hidden until the buffer diverges from the running
        // program. Click hot-reloads changes into the live VM (state preserved).
        this.reloadBtn = iconBtn('fade-runnable__btn fade-runnable__btn--reload', 'refresh-cw', 'Reload', 'Hot-reload changes (keeps state)', () => void this.doReload());
        this.reloadBtn.style.display = 'none';
        // `hide-run`: show only the Debug button (Run is suppressed) — used by the
        // homepage demo, which is all about the debugger.
        this.hideRun = this.hasAttribute('hide-run') && this.debugEnabled;

        if (noRun) { this.append(editorHost, toolbar, this.statusEl); toolbar.append(this.runBtn); return; }

        this.iframe = document.createElement('iframe');
        this.iframe.className = 'fade-runnable__vm';
        this.iframe.setAttribute('title', 'Fade output');

        // Pre-seed breakpoints from `breakpoints="11,14"` (1-based line numbers).
        if (this.debugEnabled) {
            for (const n of (this.getAttribute('breakpoints') ?? '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0)) {
                this.breakpoints.add(n);
            }
            if (breakLast) {
                const line = lastRunnableLine(value);   // value may have a hint comment prepended
                if (line > 0) this.breakpoints.add(line);
            }
            if (this.breakpoints.size) this.fadeEditor.setBreakpointLines([...this.breakpoints]);
        }

        if (this.debugEnabled) this.setupDebugControls();
        this.assembleToolbar(toolbar);

        if (this.ide) this.layoutIde(editorHost, toolbar);
        else this.layoutStacked(editorHost, toolbar);
        if (this.hasAttribute('autorun')) void this.run();

        // Detect TEST blocks and, if any, swap the Debug button for a Run-Tests
        // split button.
        if (this.debugEnabled) this.detectTests();
    }

    disconnectedCallback(): void {
        hideCrashOverlay();
        this.fadeEditor?.dispose();
        this.fadeEditor = undefined;
        if (this.debugging) setDebugHoverEvaluator(null);
        this.floatCanvas?.remove();   // it lives on <body>, so clean it up here
        this.floatCanvas = undefined;
    }

    // ── Layouts ──────────────────────────────────────────────────────────────
    private layoutStacked(editorHost: HTMLElement, toolbar: HTMLElement): void {
        this.append(editorHost, toolbar, this.statusEl!);
        if (this.debugEnabled) this.append(this.buildSidebar());
        this.append(this.buildConsole());
    }

    private layoutIde(editorHost: HTMLElement, toolbar: HTMLElement): void {
        editorHost.classList.add('fade-runnable__pane-editor');
        // Status sits at the far left; the action group is right-aligned.
        toolbar.insertBefore(this.statusEl!, toolbar.firstChild);
        // `closable`: a host-owned close button, rendered as a real toolbar child
        // (far left) so it aligns with the status text and action buttons. It
        // just emits an event; the host decides what closing means.
        if (this.hasAttribute('closable')) {
            const closeBtn = iconBtn('fade-runnable__btn', 'close', 'close', 'Close', () => this.dispatchEvent(new CustomEvent('fadeclose', { bubbles: true })));
            toolbar.insertBefore(closeBtn, toolbar.firstChild);
        }
        // MonoGame reads exactly like the web IDE (toolbar | sidebar | editor |
        // console) — but its iframe IS the game canvas, so it doesn't belong in
        // the bottom output pane. Pull it into a floating window fixed to the
        // viewport's bottom-right instead, and give the console its text role.
        if (this.mono) {
            this.append(toolbar, this.buildSidebar(), editorHost, this.buildConsole(false));
            this.buildFloatingCanvas();
        } else {
            this.append(toolbar, this.buildSidebar(), editorHost, this.buildConsole());
        }
    }

    // MonoGame: a draggable, resizable game window pinned to the viewport's
    // bottom-right. Lives on <body> (not inside the grid) so it floats over the
    // page; created hidden and revealed on the first Run/Debug (see ensureArmed).
    private buildFloatingCanvas(): void {
        const box = el('div', 'fade-runnable__float');
        const head = el('div', 'fade-runnable__float-head');
        const title = el('span', 'fade-runnable__float-title'); title.textContent = 'Game';
        const close = iconBtn('fade-runnable__float-close', 'close', '', 'Close game window', () => this.hideFloatingCanvas());
        close.addEventListener('pointerdown', (e) => e.stopPropagation());   // don't start a drag
        head.append(title, spacer(), close);
        // The game is a 16:9 "screen" centered on a checkerboard stage, so the
        // checker shows around it and the screen bounds are obvious.
        const stage = el('div', 'fade-runnable__float-stage');
        stage.append(this.iframe!);
        box.append(head, stage);
        box.style.display = 'none';
        this.makeDraggable(box, head);
        this.floatCanvas = box;
        document.body.appendChild(box);
    }

    private showFloatingCanvas(): void {
        if (this.floatCanvas) this.floatCanvas.style.display = '';
    }

    // Dismiss the floating game window. Ends any live debug session first (a
    // hidden-but-paused debugger is confusing), then hides the window — the next
    // Run/Debug re-reveals it via ensureArmed.
    private hideFloatingCanvas(): void {
        if (this.debugging) this.stopDebug();
        if (this.floatCanvas) this.floatCanvas.style.display = 'none';
    }

    // Drag the floating window by its header. Switches from the default
    // right/bottom anchoring to explicit left/top on first grab so the box
    // tracks the pointer regardless of which corner it started pinned to.
    private makeDraggable(box: HTMLElement, handle: HTMLElement): void {
        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const rect = box.getBoundingClientRect();
            const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
            box.style.right = 'auto'; box.style.bottom = 'auto';
            box.style.left = `${rect.left}px`; box.style.top = `${rect.top}px`;
            const move = (ev: PointerEvent) => {
                box.style.left = `${Math.max(0, Math.min(window.innerWidth - 40, ev.clientX - dx))}px`;
                box.style.top = `${Math.max(0, Math.min(window.innerHeight - 20, ev.clientY - dy))}px`;
            };
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
        });
    }

    // ── Toolbar assembly: status (left) … step strip, Debug, Run (right) ─────
    // Run is the primary action and lives at the far top-right corner, matching
    // the Playground's header where Run/Debug sit on the right.
    private assembleToolbar(toolbar: HTMLElement): void {
        toolbar.append(spacer());
        // `theme-picker`: render a theme <select> in the toolbar, left of the
        // action buttons (the homepage uses this so the picker lives in the editor).
        if (this.hasAttribute('theme-picker')) toolbar.append(this.buildThemePicker());
        if (this.debugBar) toolbar.append(this.debugBar);
        if (this.debugBtn) toolbar.append(this.debugBtn);
        if (!this.hideRun) toolbar.append(this.runBtn!);
        if (this.reloadBtn) toolbar.append(this.reloadBtn);
    }

    private buildThemePicker(): HTMLElement {
        const sel = document.createElement('select');
        sel.className = 'fade-runnable__theme';
        sel.title = 'Theme';
        sel.setAttribute('aria-label', 'Theme');
        for (const t of FADE_THEME_PRESETS) {
            const o = document.createElement('option');
            o.value = t.id; o.textContent = t.label;
            sel.append(o);
        }
        sel.value = getFadeTheme();
        sel.addEventListener('change', () => applyFadeTheme(sel.value));
        return sel;
    }

    private setupDebugControls(): void {
        this.fadeEditor!.onBreakpointToggle((line) => this.toggleBreakpoint(line));
        this.debugBtn = iconBtn('fade-runnable__btn fade-runnable__btn--primary fade-runnable__btn--debug', 'debug-alt', 'Debug', 'Set a breakpoint, then Debug (⌘D)', () => void this.startDebug());

        this.debugBar = el('span', 'fade-runnable__debugbar');
        const step = (icon: string, title: string, fn: () => void) => {
            const b = iconBtn('fade-runnable__tb', icon, '', title, fn);
            b.disabled = true; this.stepBtns.push(b); this.debugBar!.append(b);
        };
        step('debug-continue', 'Continue (F5)', () => this.doContinue());
        step('debug-pause', 'Pause', () => void this.runner!.debugPause());
        step('debug-step-over', 'Step Over (F10)', () => this.doStep('over'));
        step('debug-step-into', 'Step Into (F11)', () => this.doStep('in'));
        step('debug-step-out', 'Step Out (⇧F11)', () => this.doStep('out'));
        step('debug-stop', 'Stop (⇧F5)', () => this.stopDebug());
    }

    // ── Debug sidebar ─────────────────────────────────────────────────────────
    private buildSidebar(): HTMLElement {
        const sidebar = el('div', 'fade-runnable__sidebar');
        const vars = section('Variables'); this.varsBody = vars.body; this.varsBody.innerHTML = emptyMsg('Not paused');
        const watch = section('Watch'); this.watchBody = watch.body;
        watch.head.append(spacer(), iconBtn('fade-runnable__section-action', 'add', '', 'Add watch expression', (e) => { e.stopPropagation(); this.promptWatch(); }));
        const frames = section('Call Stack'); this.framesBody = frames.body; this.framesBody.innerHTML = emptyMsg('Not paused');
        const bps = section('Breakpoints'); this.bpBody = bps.body;
        sidebar.append(vars.root, watch.root, frames.root, bps.root);
        this.renderWatch(); this.renderBreakpoints();
        return sidebar;
    }

    // ── Combined Output + Debug Console (single panel) ───────────────────────
    // `includeVm` places the VM iframe here (web runtime — text output). MonoGame
    // puts the iframe (game canvas) in its own right-hand pane instead, so this
    // console holds just the stdout log + REPL.
    private buildConsole(includeVm = true): HTMLElement {
        const wrap = el('div', 'fade-runnable__console');
        wrap.append(paneHeader(includeVm ? 'Output' : 'Console'));
        if (includeVm) wrap.append(this.iframe!);
        this.replLog = el('div', 'fade-runnable__repl-log');
        const row = el('div', 'fade-runnable__repl-row');
        const prompt = el('span', 'fade-runnable__repl-prompt'); prompt.textContent = '›';
        this.replInput = document.createElement('input');
        this.replInput.className = 'fade-runnable__repl-input';
        this.replInput.type = 'text';
        this.replInput.placeholder = 'Evaluate an expression (Debug + pause first)…';
        // Always focusable — evaluating still needs a paused debug session, but
        // a clickable box (with a hint on Enter) reads far better than a dead,
        // greyed-out input on the page.
        this.replInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); const v = this.replInput!.value; this.replInput!.value = ''; void this.evalRepl(v); }
        });
        row.append(prompt, this.replInput);
        wrap.append(this.replLog, row);
        return wrap;
    }

    // ── Breakpoints ──────────────────────────────────────────────────────────
    private toggleBreakpoint(line: number): void {
        if (this.breakpoints.has(line)) this.breakpoints.delete(line);
        else this.breakpoints.add(line);
        this.fadeEditor!.setBreakpointLines([...this.breakpoints]);
        this.renderBreakpoints();
        if (this.debugging) void this.pushBreakpoints();
    }

    private renderBreakpoints(): void {
        if (!this.bpBody) return;
        const lines = [...this.breakpoints].sort((a, b) => a - b);
        if (!lines.length) { this.bpBody.innerHTML = emptyMsg('None — click the gutter'); return; }
        this.bpBody.innerHTML = '';
        for (const ln of lines) {
            const row = el('div', 'fade-runnable__bp');
            row.innerHTML = `<span class="fade-runnable__bp-dot"></span><span class="fade-runnable__bp-line">Line ${ln}</span>`;
            row.append(iconBtn('fade-runnable__row-remove', 'close', '', 'Remove breakpoint', () => this.toggleBreakpoint(ln)));
            this.bpBody!.append(row);
        }
    }

    // ── Session lifecycle ────────────────────────────────────────────────────
    // `testName` focuses the debug session on a single TEST block; omit it to
    // debug the main program.
    private async startDebug(testName?: string): Promise<void> {
        if (this.debugging || !this.runner || !this.iframe) return;
        this.closeTestMenu();
        this.debugging = true;
        this.debugTestName = testName;   // for reporting pass/fail when it finishes
        this.fatal = false;
        this.classList.add('fade-runnable--debugging');
        hideCrashOverlay();
        this.setStatus('Loading runtime…');
        // Show the hovered symbol's live value while paused (VSCode behavior).
        setDebugHoverEvaluator(async (word) => {
            if (!this.paused || !this.runner) return null;
            const r = await this.runner.debugEval(this.activeFrame, word);
            return (r && r.id !== -1 && r.value != null) ? { value: String(r.value), type: r.type } : null;
        });
        try {
            await this.ensureArmed();
            this.runner.onDebugEvent = (ev) => void this.onDebugEvent(ev as { type: string; json?: string });
            this.setStatus(testName ? `Debugging test ${testName}…` : 'Debugging…');
            const src = this.fadeEditor!.getValue();
            const res = testName ? await this.runner.debugStartTest(src, testName) : await this.runner.debugStart(src);
            // A proper start returns { ok: true, statementLines }. Some runtime
            // builds don't yet implement debug-start-test and return {} — detect
            // that so we don't hang in a silent "Debugging…" state.
            if (!res || res.ok !== true) {
                const msg = res && res.error ? res.error : 'Failed to start the debugger';
                this.stopDebug();               // resets status…
                this.setStatus(msg, true);      // …so set the message after
                return;
            }
            // Session is live and about to run: enable the running-state
            // controls (steps disabled, but Stop clickable) so the user can stop
            // a program that never hits a breakpoint.
            this.setStepEnabled(false);
            await this.pushBreakpoints();
            await this.runner.debugContinue();
        } catch (e) {
            this.setStatus(e instanceof Error ? e.message : String(e), true);
            this.stopDebug();
        }
    }

    // ── Tests ─────────────────────────────────────────────────────────────────
    private applyTestNames(names: string[]): void {
        const sig = names.join(',');
        if (sig === this.renderedTestSig) return;
        this.renderedTestSig = sig;
        this.tests = names.map((name) => ({ name, isAbstract: false, fromParent: null, sourceLine: 0, sourceChar: 0 }));
        this.renderTestControls();
    }

    // Discover TEST blocks. The real names come from the compiler (via the VM),
    // because #MACRO/#TOKENIZE generate them — `TEST sample_[v]` becomes
    // sample_42, sample_888, … and even editing an unrelated line (the values fed
    // to the macro) can change them. So we re-fetch on ANY source change, not
    // just when the TEST lines change. A cheap scan fills the button instantly
    // the first time (before the VM is ready); after that the compiler's list
    // is authoritative.
    private async detectTests(): Promise<void> {
        const src = this.fadeEditor?.getValue() ?? '';
        if (src === this.lastTestScan) return;   // source unchanged
        this.lastTestScan = src;

        if (!/^[ \t]*TEST\b/im.test(src)) { this.applyTestNames([]); return; }

        // Approximate list, shown only before we have any compiler-confirmed
        // names — re-showing it on every edit would flicker macro names.
        if (!this.renderedTestSig) {
            const raw: string[] = [];
            const re = /^[ \t]*TEST[ \t]+([A-Za-z_]\w*)/gim;
            for (let m; (m = re.exec(src)); ) raw.push(m[1]);
            this.applyTestNames([...new Set(raw)]);
        }

        try {
            await this.ensureArmed();
            const list = await this.runner!.listTests(src);
            if (src !== this.lastTestScan) return;   // a newer edit is already being fetched
            this.applyTestNames((list ?? []).filter((t) => !t.isAbstract).map((t) => t.name));
        } catch { /* keep the last names */ }
    }
    // The set of selectable primary actions for the split button: debug a
    // specific test (default), or debug the whole program. Running all tests is
    // intentionally not offered here — this control is for debugging.
    private testActions(): { key: string; label: string; icon: string; run: () => void }[] {
        const acts = this.tests.map((t) => ({ key: `debug:${t.name}`, label: `Debug test: ${t.name}`, icon: 'debug-alt', run: () => void this.startDebug(t.name) }));
        acts.push({ key: 'debug-program', label: 'Debug Program', icon: 'debug-alt', run: () => void this.startDebug() });
        return acts;
    }

    // With tests present, replace the Debug button with a split button whose main
    // half runs the SELECTED action and whose caret opens a menu to change it.
    private renderTestControls(): void {
        this.testControls?.remove();
        this.testMenu?.remove();
        this.testControls = undefined;
        this.testMenu = undefined;
        if (!this.tests.length || !this.debugBtn) {
            if (this.debugBtn) this.debugBtn.style.display = '';
            return;
        }

        this.debugBtn.style.display = 'none';   // its "debug program" action moves into the menu

        // Default to (and fall back to) the first action — the first test — so a
        // test snippet opens ready to debug that test. Also re-anchors if the
        // selected test was edited away.
        const actions = this.testActions();
        if (!actions.some((a) => a.key === this.primaryKey)) this.primaryKey = actions[0].key;
        const primary = actions.find((a) => a.key === this.primaryKey)!;

        const group = el('span', 'fade-runnable__split');
        const main = iconBtn('fade-runnable__btn fade-runnable__btn--primary fade-runnable__split-main', primary.icon, primary.label, primary.label, () => primary.run());
        const caret = iconBtn('fade-runnable__btn fade-runnable__btn--primary fade-runnable__split-caret', 'chevron-down', '', 'Choose what this button does', (e) => { e.stopPropagation(); this.toggleTestMenu(); });
        group.append(main, caret);
        this.testControls = group;
        this.debugBtn.parentElement?.insertBefore(group, this.debugBtn);
    }

    // The caret menu just CHANGES which action the main button runs — it doesn't
    // start anything. Picking one updates the button; the user then clicks it.
    private toggleTestMenu(): void {
        if (this.testMenu) { this.closeTestMenu(); return; }
        const menu = el('div', 'fade-runnable__menu');
        for (const a of this.testActions()) {
            const b = el('button', 'fade-runnable__menu-item' + (a.key === this.primaryKey ? ' is-selected' : '')) as HTMLButtonElement;
            b.type = 'button';
            b.innerHTML = `<span class="codicon codicon-check" style="visibility:${a.key === this.primaryKey ? 'visible' : 'hidden'}"></span><span>${a.label}</span>`;
            b.addEventListener('click', (e) => { e.stopPropagation(); this.primaryKey = a.key; this.closeTestMenu(); this.renderTestControls(); });
            menu.append(b);
        }
        this.testMenu = menu;
        this.testControls?.append(menu);
        // Dismiss on outside click / Escape.
        setTimeout(() => {
            const onDoc = (e: Event) => { if (!menu.contains(e.target as Node)) this.closeTestMenu(); };
            const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.closeTestMenu(); };
            (menu as any)._cleanup = () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
            document.addEventListener('mousedown', onDoc);
            document.addEventListener('keydown', onKey);
        }, 0);
    }

    private closeTestMenu(): void {
        if (!this.testMenu) return;
        (this.testMenu as any)._cleanup?.();
        this.testMenu.remove();
        this.testMenu = undefined;
    }

    private pushBreakpoints(): Promise<boolean> {
        return this.runner!.debugSetBreakpoints([...this.breakpoints].map((ln) => ({ line: ln - 1, column: 0 })));
    }

    private doContinue(): void { this.setResumed('running…'); void this.runner!.debugContinue(); }
    private doStep(kind: 'over' | 'in' | 'out'): void { this.setResumed('stepping…'); void this.runner!.debugStep(kind); }

    private setResumed(status: string): void {
        this.paused = false;
        this.setStepEnabled(false);
        /* repl input stays clickable; eval is gated in evalRepl */
        this.fadeEditor?.setCurrentLine(null);
        this.setStatus(status);
    }

    private async onDebugEvent(ev: { type: string; json?: string }): Promise<void> {
        if (ev.type === 'REV_REQUEST_BREAKPOINT') { await this.onPaused('paused on breakpoint'); return; }
        if (ev.type === 'PROTO_ACK') {
            let stepLanded = false;
            if (ev.json) { try { const p = JSON.parse(ev.json); stepLanded = p?.status === 1 && typeof p?.reason === 'string'; } catch { /* not structured */ } }
            if (stepLanded) await this.onPaused('paused');
            return;
        }
        if (ev.type === 'REV_REQUEST_EXITED' || ev.type === 'complete') {
            if (this.debugTestName) { await this.reportTestResult(); return; }
            this.stopDebug('program exited');
            return;
        }
        if (ev.type === 'error' || ev.type === 'REV_REQUEST_EXPLODE') { await this.onFatal(ev.json ?? ''); }
    }

    // A debugged test ran to completion — query its pass/fail verdict (while the
    // session is still alive), then end the session and show the result.
    private async reportTestResult(): Promise<void> {
        const name = this.debugTestName;
        let result = null;
        try { result = await this.runner!.debugGetTestResult(); } catch { /* none */ }
        this.stopDebug();   // terminates the session + resets status
        if (result) {
            const passed = result.passed;
            const detail = !passed && result.failureMessage ? `: ${result.failureMessage}` : '';
            this.setStatus(`${passed ? '✓' : '✗'} ${result.name || name} ${passed ? 'passed' : 'failed'}${detail}`, !passed);
        } else {
            this.setStatus(`test ${name} finished`);
        }
    }

    // Fatal VM exception (divide-by-zero, out-of-bounds, …). Mirror the
    // Playground: keep the session paused for post-mortem (locals/call stack
    // stay live, step/continue disabled since the VM can't resume), and paint
    // the red crash overlay on the failing line.
    private async onFatal(raw: string): Promise<void> {
        // The bridge wraps a mid-run Stop as an "interrupted by terminate"
        // explode — that's a clean stop, not a real error.
        if (/interrupted by terminate/i.test(raw)) { this.stopDebug('stopped'); return; }

        const summary = summarizeCrash(raw);
        const text = summary.detail ? `${summary.title} — ${summary.detail}` : summary.title;
        this.appendRepl(summary.isSystem ? `[Internal] ${text}` : text, 'err');

        this.paused = true;
        this.fatal = true;
        this.setStatus('runtime error', true);
        this.setStepEnabled(false); // VM can't resume past the fault
        if (this.replInput) this.replInput.disabled = false;
        // Hydrate frames / locals / watch so the user can inspect the crash.
        try { const res: any = await this.runner!.debugStackFrames(); this.frames = Array.isArray(res) ? res : (res?.stackFrames ?? []); } catch { this.frames = []; }
        this.activeFrame = 0;
        this.renderCallStack();
        await this.refreshVars();
        await this.refreshWatch();

        // Failing line: the VM halts at the fault, so the top frame's line is
        // the crash site. Fall back to resolving the instruction index.
        let line: number | null = typeof this.frames[this.activeFrame]?.lineNumber === 'number'
            ? this.frames[this.activeFrame].lineNumber + 1 : null;
        if (line == null) {
            const ins = extractInsIndex(summary.inner);
            if (ins != null) { try { const r = await this.runner!.resolveInstruction(ins); if (r) line = r.lineNumber + 1; } catch { /* ignore */ } }
        }
        if (line != null && this.fadeEditor) {
            this.fadeEditor.setCurrentLine(null);
            showCrashOverlay({
                editor: this.fadeEditor.editor,
                line,
                kind: summary.kind,
                title: summary.title,
                detail: summary.detail,
                isSystem: summary.isSystem,
                onAbort: () => this.stopDebug(''),
            });
        }
    }

    private async onPaused(status: string): Promise<void> {
        this.paused = true;
        this.activeFrame = 0;
        this.setStatus(status);
        this.setStepEnabled(true);
        if (this.replInput) this.replInput.disabled = false;
        try { const res: any = await this.runner!.debugStackFrames(); this.frames = Array.isArray(res) ? res : (res?.stackFrames ?? []); } catch { this.frames = []; }
        this.moveToFrameLine();
        this.renderCallStack();
        await this.refreshVars();
        await this.refreshWatch();
    }

    private moveToFrameLine(): void {
        const line = this.frames[this.activeFrame]?.lineNumber;
        if (typeof line === 'number') this.fadeEditor!.setCurrentLine(line + 1);
    }

    private async selectFrame(index: number): Promise<void> {
        if (!this.paused) return;
        this.activeFrame = index;
        this.moveToFrameLine();
        this.renderCallStack();
        await this.refreshVars();
        await this.refreshWatch();
    }

    // ── Variables (editable) ─────────────────────────────────────────────────
    private async refreshVars(): Promise<void> {
        if (!this.varsBody) return;
        let scopes: any[] = [];
        try { scopes = (await this.runner!.debugScopes(this.activeFrame))?.scopes ?? []; } catch { /* none */ }
        this.varsBody.innerHTML = '';
        let any = false;
        for (const sc of scopes) {
            const vars: DbgVar[] = sc.variables ?? [];
            if (!vars.length) continue;
            if (sc.scopeName) { const s = el('div', 'fade-runnable__scope'); s.textContent = sc.scopeName; this.varsBody.append(s); }
            for (const v of vars) { this.varsBody.append(this.varRow(v)); any = true; }
        }
        if (!any) this.varsBody.innerHTML = emptyMsg('No variables in scope');
    }

    private varRow(v: DbgVar, indent = 0): HTMLElement {
        const wrap = el('div', 'fade-runnable__var-wrap');
        const row = el('div', 'fade-runnable__var');
        row.style.paddingLeft = (8 + indent * 14) + 'px';

        // Arrays / UDTs expand into children (fieldCount for struct members,
        // elementCount for array elements) — fetched lazily via the runner.
        const expandable = ((v.fieldCount ?? 0) + (v.elementCount ?? 0)) > 0;
        const twisty = el('span', 'fade-runnable__var-twisty');
        const childrenWrap = el('div', 'fade-runnable__var-children');
        const setTwisty = (open: boolean) => {
            twisty.className = 'fade-runnable__var-twisty' + (expandable ? ' codicon codicon-chevron-' + (open ? 'down' : 'right') : ' fade-runnable__var-twisty--empty');
        };
        setTwisty(this.expandedVars.has(v.id));
        row.append(twisty);

        const name = el('span', 'fade-runnable__varname'); name.textContent = v.name;
        if (v.type) { const t = el('span', 'fade-runnable__vartype'); t.textContent = v.type; row.append(name, t); } else row.append(name);

        const renderChildren = async () => {
            const result = await this.runner!.debugExpandVariable(v.id);
            childrenWrap.innerHTML = '';
            for (const sub of (result?.scopes ?? [])) {
                for (const child of (sub.variables ?? [])) childrenWrap.append(this.varRow(child as DbgVar, indent + 1));
            }
        };
        const toggle = async () => {
            if (!expandable) return;
            if (this.expandedVars.has(v.id)) { this.expandedVars.delete(v.id); childrenWrap.innerHTML = ''; setTwisty(false); return; }
            this.expandedVars.add(v.id); setTwisty(true);
            try { await renderChildren(); } catch { /* leave collapsed on failure */ }
        };
        twisty.addEventListener('click', (e) => { e.stopPropagation(); void toggle(); });
        if (expandable) { name.style.cursor = 'pointer'; name.addEventListener('click', (e) => { e.stopPropagation(); void toggle(); }); }
        // Preserve expansion across refreshVars (step / set-value) — re-fetch.
        if (expandable && this.expandedVars.has(v.id)) void renderChildren();

        const val = el('span', 'fade-runnable__varval'); val.textContent = v.value; val.title = 'Click to set value';
        // Click the value to edit it (VSCode behavior) → debugSetVariable.
        val.addEventListener('click', (e) => {
            if (!this.paused) return;
            e.stopPropagation();
            if (val.querySelector('input')) return;
            const input = document.createElement('input');
            input.className = 'fade-runnable__var-edit';
            input.value = v.value; input.spellcheck = false;
            val.textContent = ''; val.append(input); input.focus(); input.select();
            let done = false;
            const commit = async (apply: boolean) => {
                if (done) return; done = true;
                if (!apply) { val.textContent = v.value; return; }
                const rhs = input.value;
                try {
                    const r = await this.runner!.debugSetVariable(this.activeFrame, v.id, rhs);
                    this.appendRepl(`${v.name} = ${rhs}` + (r ? ` → ${r.value}` : ''), r && r.id === -1 ? 'err' : 'out');
                } catch (err) { this.appendRepl(err instanceof Error ? err.message : String(err), 'err'); }
                await this.refreshVars();
                await this.refreshWatch();
            };
            input.addEventListener('keydown', (ke) => { if (ke.key === 'Enter') void commit(true); else if (ke.key === 'Escape') void commit(false); });
            input.addEventListener('blur', () => void commit(true));
        });
        row.append(val);
        wrap.append(row, childrenWrap);
        return wrap;
    }

    private renderCallStack(): void {
        if (!this.framesBody) return;
        if (!this.frames.length) { this.framesBody.innerHTML = emptyMsg('Not paused'); return; }
        this.framesBody.innerHTML = '';
        this.frames.forEach((f, i) => {
            const row = el('div', 'fade-runnable__frame' + (i === this.activeFrame ? ' fade-runnable__frame--active' : ''));
            row.innerHTML = `<span class="fade-runnable__frame-name">${escapeHtml(f.name || '(top scope)')}</span><span class="fade-runnable__frame-line">${f.lineNumber + 1}:${f.colNumber}</span>`;
            row.addEventListener('click', () => void this.selectFrame(i));
            this.framesBody!.append(row);
        });
    }

    // ── Watch ────────────────────────────────────────────────────────────────
    private promptWatch(): void {
        const inp = document.createElement('input');
        inp.className = 'fade-runnable__watch-add';
        inp.placeholder = 'Expression to watch…';
        const close = () => { if (inp.parentNode) inp.remove(); };
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { const v = inp.value.trim(); if (v) { this.watches.push(v); this.renderWatch(); void this.refreshWatch(); } close(); }
            else if (e.key === 'Escape') close();
        });
        inp.addEventListener('blur', close);
        this.watchBody!.prepend(inp);
        inp.focus();
    }

    private renderWatch(): void {
        if (!this.watchBody) return;
        this.watchBody.querySelectorAll('.fade-runnable__watch-item, .fade-runnable__empty').forEach((n) => n.remove());
        if (!this.watches.length) { const e = el('div', 'fade-runnable__empty'); e.textContent = 'No watches — click +'; this.watchBody.append(e); return; }
        this.watches.forEach((expr, i) => {
            const row = el('div', 'fade-runnable__watch-item');
            row.innerHTML = `<span class="fade-runnable__watch-expr">${escapeHtml(expr)}</span><span class="fade-runnable__watch-val">—</span>`;
            row.append(iconBtn('fade-runnable__row-remove', 'close', '', 'Remove', () => { this.watches.splice(i, 1); this.renderWatch(); void this.refreshWatch(); }));
            this.watchBody!.append(row);
        });
    }

    private async refreshWatch(): Promise<void> {
        if (!this.watchBody) return;
        const cells = this.watchBody.querySelectorAll<HTMLElement>('.fade-runnable__watch-val');
        for (let i = 0; i < this.watches.length && i < cells.length; i++) {
            const cell = cells[i];
            if (!this.paused) { cell.textContent = '—'; cell.className = 'fade-runnable__watch-val'; continue; }
            try {
                const r = await this.runner!.debugEval(this.activeFrame, this.watches[i]);
                if (!r || r.id === -1) { cell.textContent = r?.value ?? 'error'; cell.className = 'fade-runnable__watch-val fade-runnable__watch-val--err'; }
                else { cell.textContent = String(r.value); cell.className = 'fade-runnable__watch-val'; }
            } catch { cell.textContent = 'error'; cell.className = 'fade-runnable__watch-val fade-runnable__watch-val--err'; }
        }
    }

    // ── REPL (executes statements — can set variables) ───────────────────────
    private async evalRepl(raw: string): Promise<void> {
        const expr = raw.trim();
        if (!expr) return;
        this.appendRepl(`› ${expr}`, 'in');
        if (!this.paused) {
            this.appendRepl('Start Debug (⌘D) and pause at a breakpoint to evaluate expressions.', 'err');
            return;
        }
        try {
            const r = await this.runner!.debugRepl(this.activeFrame, expr);
            this.appendRepl(r ? String(r.value) : '(no result)', r && r.id === -1 ? 'err' : 'out');
        } catch (err) { this.appendRepl(err instanceof Error ? err.message : String(err), 'err'); }
        await this.refreshVars();
        await this.refreshWatch();
    }

    private appendRepl(text: string, kind: 'in' | 'out' | 'err'): void {
        if (!this.replLog) return;
        const line = el('div', `fade-runnable__repl-line fade-runnable__repl-line--${kind}`);
        line.textContent = text;
        this.replLog.append(line);
        this.replLog.scrollTop = this.replLog.scrollHeight;
    }

    private setStepEnabled(on: boolean): void {
        for (const b of this.stepBtns) b.disabled = !on;
        const stop = this.stepBtns[this.stepBtns.length - 1];
        if (stop) stop.disabled = false;
    }

    private stopDebug(status = ''): void {
        if (this.runner) { void this.runner.debugTerminate().catch(() => {}); this.runner.onDebugEvent = undefined; }
        setDebugHoverEvaluator(null);
        hideCrashOverlay();
        this.debugging = false;
        this.debugTestName = undefined;
        this.fatal = false;
        this.classList.remove('fade-runnable--debugging');
        this.paused = false;
        this.expandedVars.clear();
        this.frames = [];
        this.fadeEditor?.setCurrentLine(null);
        this.hideFloatingCanvas();   // tear down the game window when debugging ends
        for (const b of this.stepBtns) b.disabled = true;
        /* repl input stays clickable; eval is gated in evalRepl */
        if (this.varsBody) this.varsBody.innerHTML = emptyMsg('Not paused');
        if (this.framesBody) this.framesBody.innerHTML = emptyMsg('Not paused');
        void this.refreshWatch();
        this.setStatus(status);
        this.updateActionsEnabled();   // reflect current compile state now debug is off
    }

    // ── Run ──────────────────────────────────────────────────────────────────
    async run(): Promise<void> {
        if (this.running || !this.runner || !this.iframe) return;
        this.running = true;
        if (this.runBtn) this.runBtn.disabled = true;
        this.runningSource = this.fadeEditor!.getValue();
        this.updateReloadButton();
        this.setStatus('');
        try {
            // Always ensureArmed — besides the one-time boot, it re-reveals the
            // MonoGame window if the user closed it, so Run restarts cleanly.
            if (!this.armed) this.setStatus('Loading runtime…');
            await this.ensureArmed();
            this.setStatus('');
            const result = JSON.parse(await this.runner.run(this.runningSource));
            if (result.compileError) this.setStatus(result.compileError, true);
            else if (result.ok === false && result.error) this.setStatus(result.error, true);
        } catch (e) {
            this.setStatus(e instanceof Error ? e.message : String(e), true);
        } finally {
            this.running = false;
            this.updateReloadButton();
            this.updateActionsEnabled();
        }
    }

    // Show the Reload button only while a program is running AND the buffer has
    // diverged from what's running. Clicking hot-reloads the diff into the live
    // VM (state preserved) via the shared wire protocol — web VM or monogame.
    private updateReloadButton(): void {
        if (!this.reloadBtn) return;
        const changed = this.running && !!this.fadeEditor && this.fadeEditor.getValue() !== this.runningSource;
        this.reloadBtn.style.display = changed ? '' : 'none';
    }

    private async doReload(): Promise<void> {
        if (!this.runner || !this.running || !this.fadeEditor) return;
        const src = this.fadeEditor.getValue();
        this.reloadBtn!.disabled = true;
        try {
            const r = await this.runner.armReload(src);
            if (r.compileError) {
                this.setStatus(r.compileError, true);
            } else if (r.verdict === 'PermanentlyRude') {
                this.setStatus('Can’t hot-reload (' + (r.rudeReason || 'incompatible change') + ') — press Run to restart', true);
            } else {
                // ApplicableNow / PendingTransient: the VM applies it at its next
                // clean safepoint. Treat the new buffer as the running program.
                this.runningSource = src;
                this.setStatus('reloaded');
                this.setAttribute('data-reload-verdict', r.verdict || '');
            }
        } catch (e) {
            this.setStatus(e instanceof Error ? e.message : String(e), true);
        } finally {
            if (this.reloadBtn) this.reloadBtn.disabled = false;
            this.updateReloadButton();
        }
    }

    // ── Compile-error gating ─────────────────────────────────────────────────
    // Diagnostics pass reports the current error count; Run/Debug can't produce
    // anything from a program that won't compile, so gate them on a clean build.
    private onDiagnostics(errors: number): void {
        this.compileErrors = errors;
        if (this.debugEnabled) this.detectTests();   // keep the test controls in sync with edits
        this.updateReloadButton();                    // reveal Reload when the buffer diverges from the run
        this.updateActionsEnabled();
    }

    private updateActionsEnabled(): void {
        const blocked = this.compileErrors > 0;
        if (this.debugBtn && !this.debugging) {
            this.debugBtn.disabled = blocked;
            this.debugBtn.title = blocked ? 'Fix the errors in the code to debug' : 'Set a breakpoint, then Debug (⌘D)';
        }
        if (this.runBtn && !this.running) this.runBtn.disabled = blocked;
        // Also gate the Run-Tests split button (present only for test snippets).
        if (this.testControls && !this.running && !this.debugging) {
            for (const b of this.testControls.querySelectorAll('button')) (b as HTMLButtonElement).disabled = blocked;
            if (blocked) this.closeTestMenu();
        }
    }

    // Boot the VM iframe once, sharing a single in-flight promise so concurrent
    // callers (e.g. rapid edits re-listing tests while Debug also arms) don't
    // double-arm.
    private ensureArmed(): Promise<void> {
        // Reveal the floating game window as soon as a Run/Debug starts so the
        // user sees the boot splash / loading state, not just the final frame.
        // MonoGame's canvas can't show `print`, so stream program output into
        // this component's console pane instead (the runner is shared + single-
        // active, so the running component owns the hook).
        if (this.mono) {
            this.showFloatingCanvas();
            this.runner!.onOutput = (line, isErr) => this.appendRepl(line, isErr ? 'err' : 'out');
        }
        if (this.armed || !this.iframe) return Promise.resolve();
        const arm = this.mono ? armMonoGamePreview : armWebPreview;
        this.armingPromise ??= arm(this.runner!, this.iframe, this.assetBase()).then(() => { this.armed = true; });
        return this.armingPromise;
    }

    private assetBase(): string { return this.getAttribute('asset-base') ?? '/runtime/'; }
    private setStatus(text: string, err = false): void {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        this.statusEl.className = 'fade-runnable__status' + (err ? ' fade-runnable__status--error' : '');
    }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function el(tag: string, className: string): HTMLElement { const e = document.createElement(tag); e.className = className; return e; }
function spacer(): HTMLElement { return el('span', 'fade-runnable__spacer'); }
function emptyMsg(t: string): string { return `<div class="fade-runnable__empty">${escapeHtml(t)}</div>`; }
function iconBtn(className: string, codicon: string, label: string, title: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = className; b.type = 'button'; b.title = title;
    const ic = document.createElement('span'); ic.className = `codicon codicon-${codicon}`;
    b.append(ic);
    if (label) { const t = document.createElement('span'); t.className = 'fade-runnable__btn-label'; t.textContent = label; b.append(t); }
    b.addEventListener('click', onClick);
    return b;
}
function paneHeader(title: string): HTMLElement { const h = el('div', 'fade-runnable__pane-title'); h.textContent = title; return h; }
function section(title: string): { root: HTMLElement; head: HTMLElement; body: HTMLElement } {
    const root = el('div', 'fade-runnable__section');
    const head = el('div', 'fade-runnable__section-head');
    const twisty = el('span', 'codicon codicon-chevron-down fade-runnable__twisty');
    const label = el('span', 'fade-runnable__section-title'); label.textContent = title;
    head.append(twisty, label);
    const body = el('div', 'fade-runnable__section-body');
    head.addEventListener('click', () => {
        const collapsed = body.classList.toggle('fade-runnable__section-body--collapsed');
        twisty.className = 'codicon fade-runnable__twisty ' + (collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down');
    });
    root.append(head, body);
    return { root, head, body };
}
function dedent(s: string): string {
    const lines = s.replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
    const nonEmpty = lines.filter((l) => l.trim());
    if (!nonEmpty.length) return s.trim();
    const indent = Math.min(...nonEmpty.map((l) => l.match(/^\s*/)![0].length));
    return lines.map((l) => l.slice(indent)).join('\n');
}

// The 1-based line number of the program's last runnable statement — the last
// line that isn't blank or a pure comment (`… or REM …). Used by `break-last`
// to drop a breakpoint where a reader can inspect final state. 0 if none.
function lastRunnableLine(source: string): number {
    const lines = source.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const t = lines[i].trim();
        if (!t || t.startsWith('`') || /^rem\b/i.test(t)) continue;
        return i + 1;
    }
    return 0;
}

function injectStyles(): void {
    if (typeof document === 'undefined') return;
    // Find-or-create a single <style>, and always refresh its contents. Not a
    // one-shot guard, so Vite HMR (which re-runs this module and reconstructs
    // elements) picks up CSS edits without a full page reload.
    let style = document.head.querySelector<HTMLStyleElement>('style[data-fade-runnable]');
    if (!style) { style = document.createElement('style'); style.setAttribute('data-fade-runnable', ''); document.head.appendChild(style); }
    style.textContent = `
.fade-runnable { display: block; border: 1px solid var(--border-2); border-radius: 6px; overflow: hidden; background: var(--bg); color: var(--fg); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.fade-runnable__editor { height: 220px; }
.fade-runnable__toolbar { display: flex; gap: 6px; align-items: center; padding: 6px 8px; background: var(--bg-2); border-top: 1px solid var(--border-2); }
.fade-runnable__theme { flex: 0 0 auto; background: var(--bg-3); color: var(--fg); border: 1px solid var(--border-2); border-radius: 6px; font: inherit; font-size: 12px; padding: 3px 6px; cursor: pointer; }
.fade-runnable__theme:focus { outline: none; border-color: var(--accent); }
.fade-runnable__spacer { flex: 1 1 auto; min-width: 0; }
/* width/flex are pinned so host \`button {}\` styles (e.g. width:100%) can't
   stretch these — the toolbar buttons are always content-width. */
.fade-runnable__btn { flex: 0 0 auto; width: auto; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; background: var(--btn-hover-bg); color: var(--fg); border: 0; border-radius: 4px; padding: 4px 12px; font: inherit; font-size: 13px; white-space: nowrap; }
.fade-runnable__btn:hover:not(:disabled) { background: var(--bg-3); }
.fade-runnable__btn:disabled { opacity: 0.5; cursor: not-allowed; background: var(--btn-hover-bg); color: var(--fg-muted); }
.fade-runnable__btn--primary { background: var(--accent); }
.fade-runnable__btn--primary:hover:not(:disabled) { background: var(--accent-hover); }
.fade-runnable__btn .codicon { font-size: 15px; }
/* Run-Tests split button: a main action fused to a caret. */
.fade-runnable__split { position: relative; display: inline-flex; flex: 0 0 auto; }
.fade-runnable__split-main { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.fade-runnable__split-caret { border-top-left-radius: 0; border-bottom-left-radius: 0; padding: 4px 6px; margin-left: 1px; }
.fade-runnable__split-caret .codicon { font-size: 13px; }
.fade-runnable__menu {
    position: absolute; top: calc(100% + 4px); right: 0; z-index: 40; min-width: 180px;
    background: var(--bg-2); border: 1px solid #454545; border-radius: 6px; padding: 4px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.45); display: flex; flex-direction: column; gap: 1px;
}
.fade-runnable__menu-item {
    width: 100%; display: flex; align-items: center; gap: 6px; text-align: left; background: transparent;
    color: var(--fg); border: 0; border-radius: 4px; padding: 5px 10px; font: inherit; font-size: 12px;
    cursor: pointer; white-space: nowrap;
}
.fade-runnable__menu-item .codicon { font-size: 13px; flex: 0 0 auto; }
.fade-runnable__menu-item.is-selected { color: var(--fg); }
.fade-runnable__menu-item:hover { background: var(--list-active-bg); color: var(--fg); }
/* flex: 0 1 auto so status yields to the step strip (never pushes it off the
   right edge); min-width:0 lets it ellipsize. */
.fade-runnable__status { flex: 0 1 auto; min-width: 0; padding: 0 8px; color: var(--fg-muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fade-runnable__status--error { color: #f14c4c; }
.fade-runnable__vm { display: block; width: 100%; height: 150px; border: 0; background: var(--bg); }
/* MonoGame mode: the iframe IS the game canvas and floats in a fixed window
   (.fade-runnable__float) rather than sitting in the output pane. */
/* The step strip only appears while a debug session is active. flex:none keeps
   it fully visible regardless of the toolbar width. */
.fade-runnable__debugbar { display: none; flex: none; gap: 1px; align-items: center; background: var(--bg-3); border: 1px solid var(--border-2); border-radius: 6px; padding: 2px; }
.fade-runnable--debugging .fade-runnable__debugbar { display: inline-flex; }
/* While a session is live the step strip drives things — hide the Debug button. */
.fade-runnable--debugging .fade-runnable__btn--debug { display: none; }
.fade-runnable__tb { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; background: transparent; color: var(--fg-2); border: 0; border-radius: 4px; width: 28px; height: 24px; }
.fade-runnable__tb:hover:not(:disabled) { background: var(--btn-hover-bg); }
.fade-runnable__tb:disabled { opacity: 0.35; cursor: default; }
.fade-runnable__tb .codicon { font-size: 16px; }
.fade-runnable__tb .codicon-debug-continue { color: #89d185; }
/* Debug pane / sidebar */
.fade-runnable__sidebar { background: var(--bg); font-size: 12px; border-top: 1px solid var(--border-2); }
.fade-runnable__pane-title { text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: var(--fg-muted); padding: 5px 8px; background: var(--bg-2); border-bottom: 1px solid var(--border-2); }
.fade-runnable__section { border-bottom: 1px solid var(--border-2); }
.fade-runnable__section-head { display: flex; align-items: center; gap: 4px; padding: 4px 8px; cursor: pointer; user-select: none; background: var(--bg-2); }
.fade-runnable__section-head:hover { background: var(--hover-bg); }
.fade-runnable__twisty { color: var(--fg-muted); font-size: 14px; }
.fade-runnable__section-title { text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: var(--fg-2); }
.fade-runnable__section-action { flex: 0 0 auto; width: auto; margin-left: auto; cursor: pointer; background: transparent; color: var(--fg-muted); border: 0; display: inline-flex; }
.fade-runnable__section-action:hover { color: var(--fg); }
/* No horizontal padding here — rows are full-bleed and carry their own 8px
   inset, so each line (and its hover) spans the full column width. */
.fade-runnable__section-body { padding: 4px 0 6px; max-height: 200px; overflow: auto; }
.fade-runnable__section-body--collapsed { display: none; }
.fade-runnable__empty { color: var(--fg-muted); font-style: italic; padding: 2px 8px; }
.fade-runnable__scope { color: var(--fg-muted); text-transform: uppercase; font-size: 10px; margin: 4px 0 2px; padding: 0 8px; }
.fade-runnable__var-wrap { }
.fade-runnable__var { display: flex; gap: 6px; padding: 1px 8px; align-items: center; }
.fade-runnable__var:hover { background: var(--hover-bg); }
.fade-runnable__var-twisty { flex: 0 0 auto; width: 14px; display: inline-flex; align-items: center; justify-content: center; color: var(--fg-muted); cursor: pointer; font-size: 14px; }
.fade-runnable__var-twisty--empty { cursor: default; }
.fade-runnable__var-children { }
.fade-runnable__varname { color: var(--link-fg); }
.fade-runnable__vartype { color: var(--fg-muted); opacity: 0.6; }
.fade-runnable__varval { color: var(--code-fg); margin-left: auto; cursor: text; border-radius: 3px; padding: 0 2px; }
.fade-runnable__varval:hover { background: var(--hover-bg); }
.fade-runnable__var-edit { width: 90px; background: var(--bg); color: var(--fg); border: 1px solid #007acc; border-radius: 3px; padding: 0 3px; font: inherit; font-size: 12px; }
.fade-runnable__watch-item { display: flex; gap: 8px; padding: 1px 8px; align-items: center; }
.fade-runnable__watch-item:hover { background: var(--hover-bg); }
.fade-runnable__watch-expr { color: var(--link-fg); }
.fade-runnable__watch-val { color: var(--code-fg); margin-left: auto; }
.fade-runnable__watch-val--err { color: #f14c4c; font-style: italic; }
.fade-runnable__watch-add { width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--border-2); border-radius: 4px; padding: 2px 6px; font: inherit; font-size: 12px; margin-bottom: 4px; }
.fade-runnable__frame { display: flex; gap: 6px; padding: 2px 8px; cursor: pointer; }
.fade-runnable__frame:hover { background: var(--hover-bg); }
.fade-runnable__frame--active { background: var(--list-active-bg); }
.fade-runnable__frame-name { color: var(--accent); }
.fade-runnable__frame-line { color: var(--fg-muted); margin-left: auto; }
.fade-runnable__bp { display: flex; align-items: center; gap: 6px; padding: 2px 8px; }
.fade-runnable__bp:hover { background: var(--hover-bg); }
.fade-runnable__bp-dot { width: 9px; height: 9px; border-radius: 50%; background: #e51400; flex: none; }
.fade-runnable__bp-line { color: var(--fg); }
.fade-runnable__row-remove { flex: 0 0 auto; width: auto; margin-left: auto; cursor: pointer; background: transparent; color: var(--fg-muted); border: 0; display: inline-flex; }
.fade-runnable__row-remove:hover { color: #f14c4c; }
/* Combined Output + Debug Console */
.fade-runnable__console { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--border-2); }
.fade-runnable__repl-log { overflow: auto; white-space: pre-wrap; padding: 2px 8px; max-height: 90px; }
.fade-runnable__repl-log:empty { display: none; }
.fade-runnable__repl-line--in { color: var(--link-fg); }
.fade-runnable__repl-line--out { color: var(--fg); }
.fade-runnable__repl-line--err { color: #f14c4c; }
.fade-runnable__repl-row { display: flex; align-items: center; gap: 6px; border-top: 1px solid var(--border-2); padding: 4px 8px; }
.fade-runnable__repl-prompt { color: var(--fg-muted); }
.fade-runnable__repl-input { flex: 1; background: var(--bg); color: var(--fg); border: 1px solid var(--border-2); border-radius: 4px; padding: 3px 6px; font: inherit; font-size: 12px; }
.fade-runnable__repl-input:disabled { opacity: 0.5; }
/* IDE layout — mini VSCode */
/* minmax(0, 1fr) — NOT plain 1fr — so the editor track can shrink below its
   content's min-content. Monaco's min-content (longest line) is large; with a
   bare 1fr the grid (and the toolbar spanning it) is forced wider than the
   viewport, pushing the right-aligned Run/Debug buttons off-screen. */
.fade-runnable--ide { display: grid; height: min(80vh, 900px); min-height: 480px; grid-template-columns: 260px minmax(0, 1fr); grid-template-rows: auto 1fr minmax(140px, 26%); grid-template-areas: "toolbar toolbar" "sidebar editor" "bottom bottom"; }
.fade-runnable--ide .fade-runnable__toolbar { grid-area: toolbar; border-top: 0; border-bottom: 1px solid var(--border-2); }
.fade-runnable--ide .fade-runnable__sidebar { grid-area: sidebar; overflow: auto; border-right: 1px solid var(--border-2); border-top: 0; }
.fade-runnable--ide .fade-runnable__pane-editor { grid-area: editor; height: 100%; }
.fade-runnable--ide .fade-runnable__console { grid-area: bottom; min-height: 0; }
/* min-height:0 so the iframe (intrinsic 150px, min-height:auto by default)
   can shrink and leave room for the REPL row below it in the console. */
.fade-runnable--ide .fade-runnable__vm { flex: 1; height: auto; min-height: 0; }
.fade-runnable--ide .fade-runnable__status { padding: 0 10px 0 4px; }
/* MonoGame floating game window — pinned to the viewport bottom-right, drag by
   the header, resizable. The editor/sidebar/console read exactly like the web
   IDE; only the game output floats free. */
.fade-runnable__float {
    position: fixed; right: 20px; bottom: 20px; z-index: 9999;
    width: 560px; height: 360px; min-width: 280px; min-height: 200px;
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--bg); border: 1px solid #454545; border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.55);
    resize: both;
}
.fade-runnable__float-head {
    display: flex; align-items: center; flex: none;
    padding: 5px 10px; background: var(--bg-2); border-bottom: 1px solid var(--border-2);
    cursor: move; user-select: none; touch-action: none;
}
.fade-runnable__float-title { text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: var(--fg-muted); }
.fade-runnable__float-close { flex: 0 0 auto; cursor: pointer; background: transparent; color: var(--fg-muted); border: 0; border-radius: 4px; width: 22px; height: 20px; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.fade-runnable__float-close:hover { background: var(--btn-hover-bg); color: var(--fg); }
.fade-runnable__float-close .codicon { font-size: 14px; }
/* Stage: a dark-grey checkerboard so the letterbox around the 16:9 game screen
   is visible and the screen bounds are obvious. */
.fade-runnable__float-stage {
    flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center;
    padding: 8px; overflow: hidden;
    background-color: #2a2a2a;
    background-image:
        linear-gradient(45deg, #202020 25%, transparent 25%, transparent 75%, #202020 75%),
        linear-gradient(45deg, #202020 25%, transparent 25%, transparent 75%, #202020 75%);
    background-size: 22px 22px;
    background-position: 0 0, 11px 11px;
}
.fade-runnable__float .fade-runnable__vm {
    aspect-ratio: 16 / 9; width: 100%; height: auto; max-width: 100%; max-height: 100%;
    background: #000; display: block; border: 0;
    box-shadow: 0 0 0 1px #000, 0 2px 12px rgba(0, 0, 0, 0.5);
}
`;
}

if (typeof customElements !== 'undefined' && !customElements.get('fade-runnable')) {
    customElements.define('fade-runnable', FadeRunnableElement);
}
