// License manager for the Fade Playground.
//
// Sublime-style nagware: nothing is gated, but after a run of exports or
// compiles with no key installed we occasionally surface a "please buy"
// dialog. A license is a signed JWT (minted by the license-server worker)
// stored in localStorage. Keys are purely informational — a valid key just
// stops the nag. No feature ever checks it for authorization.
//
// The JWT is NOT verified here (HMAC verification would need the shared
// secret). We only need its payload (`sub`, `email`, `name`) for identity /
// blacklisting / telemetry, so we decode it client-side. The server-side
// signature matters only if we later add server-side verification; the minted
// token is what we receive from the canonical source, not from the user.
//
// Behavior:
//   - applyLicenseFromUrl()  → import ?key=<jwt> on boot, save, strip param
//   - storeLicense()/hasLicense()/getLicense()/clearLicense() → localStorage
//   - recordExport()/recordCompile() → bump counters, maybe nag
//   - fetchBlacklist() → pull revoked identities from the license server
//   - pingTelemetry()  → fire-and-forget notifier when a valid key is seen

const LICENSE_KEY = 'fade.license';
const USAGE_KEY = 'fade.licenseUsage';

// How often to nag (every N-th event). These are the "every export" /
// "every 300th compile" knobs from the plan.
const EXPORT_NAG_INTERVAL = 3;
const COMPILE_NAG_INTERVAL = 500;

export interface UsageCounts {
    exports: number;
    compiles: number;
    // Internal: the last threshold boundary a nag was shown at, so we nag
    // every INTERVAL without ever resetting the accumulating counters.
    exportsNagged?: number;
    compilesNagged?: number;
}

export interface LicensePayload {
    sub: string;
    email?: string;
    name?: string;
    iat: number;
    ver: number;
    version?: number;
}

// ── localStorage helpers ────────────────────────────────────────────────

export function readUsage(): UsageCounts {
    try {
        const raw = localStorage.getItem(USAGE_KEY);
        if (!raw) return { exports: 0, compiles: 0 };
        const parsed = JSON.parse(raw) as Partial<UsageCounts>;
        return {
            exports: typeof parsed.exports === 'number' ? parsed.exports : 0,
            compiles: typeof parsed.compiles === 'number' ? parsed.compiles : 0,
            exportsNagged: typeof parsed.exportsNagged === 'number' ? parsed.exportsNagged : 0,
            compilesNagged: typeof parsed.compilesNagged === 'number' ? parsed.compilesNagged : 0,
        };
    } catch {
        return { exports: 0, compiles: 0 };
    }
}

function writeUsage(usage: UsageCounts): void {
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(usage)); } catch { /* ignore */ }
}

// ── License payload ────────────────────────────────────────────────────

// Decode a compact JWT's payload without verifying the signature.
export function decodeJwtPayload(jwt: string): LicensePayload | null {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    try {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const bin = atob(padded);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        // atob is ASCII-safe; the payload is pure UTF-8 JSON. Treat bytes as
        // latin1 (a 1:1 byte map back) then re-decode as UTF-8 so emails with
        // non-ASCII render correctly.
        const latin1 = new TextDecoder('latin1').decode(bytes);
        const parsed = JSON.parse(latin1) as LicensePayload;
        if (!parsed || typeof parsed.sub !== 'string' || !parsed.sub) return null;
        return parsed;
    } catch {
        return null;
    }
}

function isValidJwt(jwt: string): boolean {
    return decodeJwtPayload(jwt) !== null;
}

export function hasLicense(): boolean {
    try {
        const jwt = localStorage.getItem(LICENSE_KEY);
        return !!jwt && isValidJwt(jwt);
    } catch {
        return false;
    }
}

export function getLicense(): LicensePayload | null {
    try {
        const jwt = localStorage.getItem(LICENSE_KEY);
        if (!jwt) return null;
        return decodeJwtPayload(jwt);
    } catch {
        return null;
    }
}

export function storeLicense(jwt: string): void {
    if (!isValidJwt(jwt)) return;
    try { localStorage.setItem(LICENSE_KEY, jwt); } catch { /* ignore */ }
}

export function clearLicense(): void {
    try { localStorage.removeItem(LICENSE_KEY); } catch { /* ignore */ }
}

// ── Telemetry ──────────────────────────────────────────────────────────

// Fire-and-forget: report that a valid (non-blacklisted) key was seen.
// The nonce defeats CDN/edge dedup so each check counts as an observation.
// No-ops when no license server is configured (local dev / absent env).
export function pingTelemetry(identity: string, event: 'check' | 'activate'): void {
    if (!config?.telemetryUrl) return;
    try {
        void fetch(config.telemetryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identity, event, nonce: crypto.randomUUID() }),
            keepalive: true,
        }).catch(() => { /* best effort */ });
    } catch {
        /* best effort */
    }
}

// ── Blacklist ──────────────────────────────────────────────────────────

let blacklistCache: Set<string> | null = null;

export async function fetchBlacklist(): Promise<Set<string>> {
    if (!config?.blacklistUrl) return new Set();
    if (blacklistCache) return blacklistCache;
    try {
        const res = await fetch(config.blacklistUrl, { cache: 'no-store' });
        if (!res.ok) return new Set();
        const data = (await res.json()) as { revoked?: string[] };
        blacklistCache = new Set(data.revoked ?? []);
        return blacklistCache;
    } catch {
        return new Set();
    }
}

export function isBlacklisted(identity: string): boolean {
    return blacklistCache?.has(identity) ?? false;
}

// ── Nag dialog ─────────────────────────────────────────────────────────

// The dialog is built + torn down dynamically so license.ts needs no static
// HTML in index.html. Styling mirrors the app's confirm/changelog overlays
// using the same CSS variables.

const NAG_CSS = `
.license-nag-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.55);
    z-index: 1300;
}
.license-nag-modal {
    width: min(480px, 92vw);
    background: var(--bg-1);
    border: 1px solid var(--border-2);
    border-radius: 10px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.6);
    overflow: hidden;
    animation: license-nag-in 140ms ease-out;
}
@keyframes license-nag-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
}
.license-nag-accent {
    height: 3px;
    background: linear-gradient(90deg, #0e639c, #4daafc);
}
.license-nag-body-wrap {
    padding: 1.4rem 1.5rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
}
.license-nag-kicker {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--fg-muted);
}
.license-nag-title {
    font-size: 1.15rem;
    font-weight: 650;
    color: var(--fg);
    line-height: 1.25;
}
.license-nag-body {
    font-size: 0.84rem;
    color: var(--fg-muted);
    line-height: 1.55;
}
.license-nag-divider {
    height: 1px;
    background: var(--border-2);
    margin: 0.1rem 0;
}
.license-nag-steps {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
}
.license-nag-step {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    font-size: 0.82rem;
    color: var(--fg);
    line-height: 1.45;
}
.license-nag-step::before {
    content: "✓";
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin-top: 0.05rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(76,175,80,0.16);
    color: #4caf50;
    font-size: 0.68rem;
    font-weight: 700;
}
.license-nag-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.9rem 1.5rem 1.1rem;
    border-top: 1px solid var(--border-2);
    background: var(--bg-2);
}
.license-nag-actions {
    display: flex;
    gap: 0.55rem;
}
.license-nag-btn {
    font: inherit;
    font-size: 0.82rem;
    font-weight: 550;
    padding: 0.42rem 1rem;
    border-radius: 5px;
    border: 1px solid var(--border-2);
    background: var(--bg-1);
    color: var(--fg);
    cursor: pointer;
    transition: border-color 120ms ease, background 120ms ease;
}
.license-nag-btn:hover { border-color: var(--fg-muted); }
.license-nag-primary {
    background: #0e639c;
    border-color: #0e639c;
    color: #fff;
}
.license-nag-primary:hover {
    background: #1177bb;
    border-color: #1177bb;
}
.license-nag-link {
    background: none;
    border: none;
    color: var(--fg-muted);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
    padding: 0;
}
.license-nag-link:hover { color: var(--fg); }
.license-nag-key-row {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.2rem;
}
.license-nag-key-input {
    flex: 1;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.35rem 0.55rem;
    border: 1px solid var(--border-2);
    border-radius: 5px;
    background: var(--bg-1);
    color: var(--fg);
}
.license-nag-key-input:focus { outline: none; border-color: var(--accent, #4daafc); }
.license-nag-key-hint {
    font-size: 0.76rem;
    color: var(--fg-muted);
    margin-top: 0.3rem;
}
.license-nag-confirm { font-size: 0.78rem; }
`;

function ensureNagCss(): void {
    if (document.getElementById('license-nag-style')) return;
    const style = document.createElement('style');
    style.id = 'license-nag-style';
    style.textContent = NAG_CSS;
    document.head.appendChild(style);
}

// The URLs for "buy" and the license-server host — main.ts can inject via
// setLicenseConfig() so we don't hardcode deployment details into the module.
export interface LicenseConfig {
    buyUrl: string;
    blacklistUrl: string;
    telemetryUrl: string;
}

let config: LicenseConfig | null = null;

export function setLicenseConfig(cfg: LicenseConfig): void {
    config = cfg;
}

// The configured purchase URL (null when no license server is configured).
export function getBuyUrl(): string | null {
    return config?.buyUrl ?? null;
}

let nagOpen = false;

function showNagDialog(event: 'export' | 'compile', count: number): void {
    if (nagOpen) return;
    ensureNagCss();
    const cfg = config;

    const overlay = document.createElement('div');
    overlay.className = 'license-nag-overlay';

    const modal = document.createElement('div');
    modal.className = 'license-nag-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const accent = document.createElement('div');
    accent.className = 'license-nag-accent';

    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'license-nag-body-wrap';

    const kicker = document.createElement('div');
    kicker.className = 'license-nag-kicker';
    kicker.textContent = 'Fade Playground';

    const title = document.createElement('div');
    title.className = 'license-nag-title';
    title.textContent = hasLicense()
        ? 'Thank you for supporting Fade'
        : 'Support Fade’s development';

    // Core messaging: nothing is gated; a license is a thank-you.
    const premise = document.createElement('div');
    premise.className = 'license-nag-body';
    premise.textContent = hasLicense()
        ? 'Your library has been used a great deal. If you’ve found Fade useful, a license is the best way to keep development going.'
        : `You’ve ${event === 'export' ? `exported ${count} times` : `compiled ${count} times`}. Fade is free, and it will stay free — no features are locked or gated. A paid license is purely a way to say thanks and help keep the project going.`;

    const divider = document.createElement('div');
    divider.className = 'license-nag-divider';

    // How the purchase works.
    const stepsTitle = document.createElement('div');
    stepsTitle.className = 'license-nag-body';
    stepsTitle.textContent = 'Here’s how it works:';

    const steps = document.createElement('ul');
    steps.className = 'license-nag-steps';
    const stepDefs = [
        'Check out securely — no account needed.',
        'Your license key is emailed to you instantly.',
        'Paste it in Settings > License, or click the link, and you’re all set.',
    ];
    for (const s of stepDefs) {
        const li = document.createElement('li');
        li.className = 'license-nag-step';
        li.textContent = s;
        steps.appendChild(li);
    }

    const foot = document.createElement('div');
    foot.className = 'license-nag-foot';

    const actions = document.createElement('div');
    actions.className = 'license-nag-actions';

    // Build the "enter key" expandable row (input + Apply button). The input
    // gets a fixed id so handlers can reach it via lookup instead of through
    // closure narrowing (TS keeps `let` as its initializer type across
    // function boundaries).
    const KEY_INPUT_ID = 'license-nag-key-input';
    const buildKeyRow = (): HTMLElement => {
        const row = document.createElement('div');
        row.className = 'license-nag-key-row';
        const input = document.createElement('input');
        input.className = 'license-nag-key-input';
        input.id = KEY_INPUT_ID;
        input.placeholder = 'Paste your key here…';
        input.spellcheck = false;
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'license-nag-btn license-nag-confirm';
        confirmBtn.textContent = 'Apply';
        confirmBtn.addEventListener('click', tryApply);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryApply(); });
        row.append(input, confirmBtn);
        const hint = document.createElement('div');
        hint.className = 'license-nag-key-hint';
        hint.textContent = 'Your key was emailed to you after purchase.';
        row.appendChild(hint);
        return row;
    };

    const dismiss = () => {
        nagOpen = false;
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
    };

    const tryApply = () => {
        const input = document.getElementById(KEY_INPUT_ID) as HTMLInputElement | null;
        if (input && input.value.trim()) storeLicense(input.value.trim());
        dismiss();
    };

    const enterBtn = document.createElement('button');
    enterBtn.className = 'license-nag-btn';
    enterBtn.textContent = 'Enter Key';
    enterBtn.addEventListener('click', () => {
        // Once the key row has been rendered once, the button's behavior
        // becomes "apply the entered key" rather than "reveal the row".
        if (document.getElementById(KEY_INPUT_ID)) { tryApply(); return; }
        // Swap the Enter Key button for the key row while editing.
        enterBtn.replaceWith(buildKeyRow());
        (document.getElementById(KEY_INPUT_ID) as HTMLInputElement | null)?.focus();
    });

    // Buy button
    const buyBtn = document.createElement('button');
    buyBtn.className = 'license-nag-btn license-nag-primary';
    buyBtn.textContent = 'Buy a license';
    buyBtn.addEventListener('click', () => {
        if (cfg?.buyUrl) window.open(cfg.buyUrl, '_blank', 'noopener');
    });

    // Dismiss link (bottom-left, subtle)
    const dismissLink = document.createElement('button');
    dismissLink.className = 'license-nag-link';
    dismissLink.textContent = 'Not now';
    dismissLink.addEventListener('click', dismiss);

    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };

    actions.append(enterBtn, buyBtn);
    foot.append(dismissLink, actions);

    bodyWrap.append(kicker, title, premise, divider, stepsTitle, steps);
    modal.append(accent, bodyWrap, foot);
    overlay.appendChild(modal);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) dismiss(); });
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);

    nagOpen = true;
    buyBtn.focus();
}

// ── Usage recording + nag triggering ───────────────────────────────────

// Open the license dialog on demand (used from the Diagnostics panel's
// "Enter Key" action and any future manage-key surface), regardless of
// whether a nag threshold has been hit.
export function showLicenseDialog(): void {
    showNagDialog('compile', readUsage().compiles);
}

export async function maybeNag(kind: 'export' | 'compile'): Promise<void> {
    const counts = readUsage();
    const threshold = kind === 'export' ? EXPORT_NAG_INTERVAL : COMPILE_NAG_INTERVAL;
    const current = kind === 'export' ? counts.exports : counts.compiles;
    const nagged = kind === 'export' ? counts.exportsNagged : counts.compilesNagged;

    // Not due: below the first threshold, or not a full interval past the
    // last nag. Counters accumulate forever — we never reset them — so a
    // refresh always shows the true lifetime totals.
    if ((nagged ?? 0) + threshold > current) return;

    // Fetch the blacklist (cached after the first call) so revoked keys are
    // treated as unlicensed rather than passed as valid.
    await fetchBlacklist();

    const payload = getLicense();
    if (payload && !isBlacklisted(payload.sub)) {
        // Valid license — ping telemetry and never nag.
        pingTelemetry(payload.sub, 'check');
        return;
    }
    if (payload && isBlacklisted(payload.sub)) {
        clearLicense();
    }

    // Due for a nag. Show it and advance the nagged marker to this multiple;
    // the lifetime totals are left untouched and keep accumulating.
    showNagDialog(kind, current);
    if (kind === 'export') writeUsage({ ...counts, exportsNagged: current });
    else writeUsage({ ...counts, compilesNagged: current });
}

export function recordExport(): void {
    const usage = readUsage();
    usage.exports += 1;
    writeUsage(usage);
    void maybeNag('export');
}

export function recordCompile(): void {
    const usage = readUsage();
    usage.compiles += 1;
    writeUsage(usage);
    void maybeNag('compile');
}

// ── URL import (quiet auth) ────────────────────────────────────────────

// On boot: if the URL carries ?key=<jwt>, validate + store it, then strip the
// query param (history.replaceState) so the key isn't left in the address
// bar / history / shared links. If it's a fresh activation, notify telemetry.
export function applyLicenseFromUrl(): void {
    try {
        const url = new URL(window.location.href);
        const key = url.searchParams.get('key');
        if (!key) return;

        const payload = decodeJwtPayload(key);
        if (!payload) return;
        storeLicense(key);

        // Remove the secret param from the URL without a full reload.
        url.searchParams.delete('key');
        window.history.replaceState(null, '', url.toString());

        pingTelemetry(payload.sub, 'activate');
    } catch {
        /* best effort */
    }
}
