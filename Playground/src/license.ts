// License manager for the Fade Playground.
//
// Sublime-style nagware: nothing is gated, but after a run of exports or
// compiles with no key installed we occasionally surface a "please buy"
// dialog. A license is a signed JWT (minted by the license-server worker)
// stored in localStorage. Keys are purely informational — a valid key just
// stops the nag. No feature ever checks it for authorization.
//
// The JWT IS verified client-side with an Ed25519 PUBLIC key (RFC 8032), so a
// forged key is rejected even though it could never gate functionality. Only
// the license-server holds the private key; the client keeps only the public
// half and rejects any JWT whose signature doesn't check out (anti-minting).
// The public key comes from the embedded `publicKey` config or is fetched
// from `publicKeyUrl` (the worker's GET /public-key) on demand.
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

// localStorage accessors for the license JWT (kept side-by-side so the
// verification code above can read/write/clear without duplicating try/catch).
function readStoredKey(): string | null {
    try { return localStorage.getItem(LICENSE_KEY); } catch { return null; }
}
function setStoredKey(jwt: string): void {
    try { localStorage.setItem(LICENSE_KEY, jwt); } catch { /* ignore */ }
}
function clearStoredKey(): void {
    try { localStorage.removeItem(LICENSE_KEY); } catch { /* ignore */ }
}

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

export function hasLicense(): boolean {
    return verifiedPayload !== null;
}

export function getLicense(): LicensePayload | null {
    return verifiedPayload;
}

// Ed25519 public key verification. `verifiedPayload` holds the last key that
// passed signature verification; a forged/stale key never reaches it, so the
// UI and nag logic only ever see real licenses.
let verifiedPayload: LicensePayload | null = null;
let verificationPromise: Promise<void> | null = null;

// Ensure we've attempted to verify the stored key at least once. Sync
// callers (nag / badge) can rely on this being settled before they act.
export function ensureVerified(): Promise<void> {
    if (verificationPromise) return verificationPromise;
    verificationPromise = (async () => {
        const jwt = readStoredKey();
        if (!jwt) return;
        const payload = await verifyAndDecode(jwt);
        if (payload) {
            verifiedPayload = payload;
        } else if (await getPublicKey()) {
            // A public key is configured and the stored key failed to verify
            // → it's forged/stale. Drop it and go unlicensed. When no public
            // key is available we can't form a verdict, so we leave the key
            // untouched (it just isn't trusted this session).
            clearStoredKey();
        }
    })().finally(() => {
        verificationPromise = null;
    });
    return verificationPromise;
}

export async function storeLicense(jwt: string): Promise<boolean> {
    if (!decodeJwtPayload(jwt)) return false;
    const payload = await verifyAndDecode(jwt);
    if (!payload) return false; // not a valid Ed25519-signed JWT → reject
    setStoredKey(jwt);
    verifiedPayload = payload;
    emitLicenseChange();
    return true;
}

export function clearLicense(): void {
    verifiedPayload = null;
    clearStoredKey();
    emitLicenseChange();
}

// ── Ed25519 verification ───────────────────────────────────────────────

// Resolve the Ed25519 public key: embedded config first, else fetch the
// worker's /public-key endpoint. Cached after the first successful read.
let cachedPublicKey: string | null = null;
async function getPublicKey(): Promise<string | null> {
    if (cachedPublicKey) return cachedPublicKey;
    if (config?.publicKey) {
        cachedPublicKey = config.publicKey;
        return cachedPublicKey;
    }
    if (config?.publicKeyUrl) {
        try {
            const res = await fetch(config.publicKeyUrl, { cache: 'no-store' });
            if (res.ok) {
                const data = (await res.json()) as { publicKey?: string };
                if (data.publicKey) {
                    cachedPublicKey = data.publicKey;
                    return cachedPublicKey;
                }
            }
        } catch {
            /* fall through → no public key, cannot verify */
        }
    }
    return null;
}

// Decode then cryptographically verify a JWT against the Ed25519 public key.
// Returns the payload only if the signature is authentic, else null.
async function verifyAndDecode(jwt: string): Promise<LicensePayload | null> {
    const payload = decodeJwtPayload(jwt);
    if (!payload) return null;
    const pub = await getPublicKey();
    if (!pub) return null;
    try {
        const ok = await verifyEd25519(jwt, pub);
        return ok ? payload : null;
    } catch {
        return null;
    }
}

function b64urlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? 0 : 4 - (b64.length % 4);
    const bin = atob(b64 + '='.repeat(pad));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function verifyEd25519(jwt: string, publicKeyBase64: string): Promise<boolean> {
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;
    if (!crypto?.subtle) return false;
    const key = await crypto.subtle.importKey(
        'raw',
        base64ToBytes(publicKeyBase64),
        { name: 'Ed25519' },
        false,
        ['verify'],
    );
    const sig = b64urlToBytes(parts[2]);
    const enc = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const data = new Uint8Array(new ArrayBuffer(enc.length));
    data.set(enc);
    return crypto.subtle.verify(
        'Ed25519',
        key,
        sig,
        data,
    );
}

// ── Change notifications ────────────────────────────────────────────────
// Fired whenever the stored license changes (store/clear). Lets live UI like
// the Settings License tab re-render immediately instead of waiting for the
// next tab switch. Returns an unsubscribe fn.
const licenseListeners = new Set<() => void>();

function emitLicenseChange(): void {
    for (const cb of licenseListeners) cb();
}

export function onLicenseChange(cb: () => void): () => void {
    licenseListeners.add(cb);
    return () => { licenseListeners.delete(cb); };
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
    width: min(460px, 92vw);
    background: var(--bg-1);
    border: 1px solid var(--border-2);
    border-radius: 6px;
    box-shadow: 0 18px 40px rgba(0,0,0,0.55);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: license-nag-in 120ms ease-out;
}
@keyframes license-nag-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
}
.license-nag-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0.75rem 0.95rem;
    border-bottom: 1px solid var(--border-2);
    background: var(--bg-2);
}
.license-nag-kicker {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fg-muted);
}
.license-nag-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--fg);
    line-height: 1.3;
}
.license-nag-body-wrap {
    padding: 0.95rem 0.95rem 0.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
}
.license-nag-body {
    font-size: 0.82rem;
    color: var(--fg);
    line-height: 1.5;
}
.license-nag-body-muted {
    font-size: 0.78rem;
    color: var(--fg-muted);
    line-height: 1.45;
}
.license-nag-divider {
    height: 1px;
    background: var(--border-2);
}
.license-nag-steps-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--fg-muted);
}
.license-nag-steps {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
}
.license-nag-step {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--fg);
    line-height: 1.4;
}
.license-nag-step::before {
    content: "";
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    background: rgba(0,127,212,0.15);
    color: #007fd4;
    font-size: 0.7rem;
    font-weight: 700;
}
.license-nag-step.ok::before { content: "✓"; }
.license-nag-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.85rem 0.95rem 0.95rem;
    margin-top: 0.2rem;
    flex-wrap: wrap;
}
.license-nag-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
}
.license-nag-btn {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.32rem 0.9rem;
    border-radius: 3px;
    border: 1px solid var(--border-2);
    background: var(--bg-2);
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
.license-nag-primary:hover { background: #1177bb; border-color: #1177bb; }
.license-nag-primary:focus-visible { outline: 1px solid #fff; outline-offset: 1px; }
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

/* ── Dedicated "enter your key" view ─────────────────────────────────── */
.license-enter-body {
    padding: 1rem 0.95rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}
.license-enter-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--fg-muted);
}
.license-enter-input {
    box-sizing: border-box;
    width: 100%;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 0.82rem;
    color: var(--fg);
    background: var(--bg-1);
    border: 1px solid var(--border-2);
    border-radius: 3px;
    padding: 10px 12px;
    outline: none;
    word-break: break-all;
}
.license-enter-input::placeholder { color: var(--fg-muted); }
.license-enter-input:focus { border-color: #007fd4; }
.license-enter-hint {
    font-size: 0.74rem;
    color: var(--fg-muted);
    line-height: 1.4;
}
.license-enter-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.2rem;
    flex-wrap: wrap;
}
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
    // Ed25519 public key used to verify license JWTs. Either embed
    // `publicKey` (base64 raw 32-byte RFC 8032 key) for an offline override,
    // or point `publicKeyUrl` at the worker's GET /public-key endpoint.
    publicKey?: string;
    publicKeyUrl: string;
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

interface LicenseDialog {
    overlay: HTMLElement;
    modal: HTMLElement;
    kicker: HTMLElement;
    title: HTMLElement;
    body: HTMLElement;
    foot: HTMLElement;
    dismiss: () => void;
    setEscape: (fn: (() => void) | null) => void;
}

function openLicenseDialog(): LicenseDialog {
    ensureNagCss();
    const overlay = document.createElement('div');
    overlay.className = 'license-nag-overlay';

    const modal = document.createElement('div');
    modal.className = 'license-nag-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    // Header band (matches the app's changelog/confirm dialogs).
    const head = document.createElement('div');
    head.className = 'license-nag-head';
    const kicker = document.createElement('div');
    kicker.className = 'license-nag-kicker';
    const title = document.createElement('div');
    title.className = 'license-nag-title';
    head.append(kicker, title);

    // Content + footer get replaced per-view; both live under the modal.
    const body = document.createElement('div');
    const foot = document.createElement('div');
    foot.className = 'license-nag-foot';

    modal.append(head, body, foot);

    let escapeHandler: (() => void) | null = null;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') escapeHandler?.(); };

    const dismiss = () => {
        nagOpen = false;
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
    };

    overlay.appendChild(modal);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) dismiss(); });
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);

    nagOpen = true;

    return {
        overlay,
        modal,
        kicker,
        title,
        body,
        foot,
        dismiss,
        setEscape(fn: (() => void) | null) { escapeHandler = fn; },
    };
}

function showNagDialog(event: 'export' | 'compile', count: number): void {
    if (nagOpen) return;
    const cfg = config;
    const shell = openLicenseDialog();
    const { kicker, title, body, foot, dismiss } = shell;

    const KEY_INPUT_ID = 'license-nag-key-input';

    const applyKey = async () => {
        const input = document.getElementById(KEY_INPUT_ID) as HTMLInputElement | null;
        const raw = input?.value.trim() ?? '';
        if (!raw) return;
        // Successful application → swap to the thank-you view (also fires on
        // the Settings tab via the license-change subscription). storeLicense
        // verifies the Ed25519 signature and rejects a forged key.
        if (await storeLicense(raw)) renderThankYou();
    };

    // ── "Pitch" view: the persuade/thank-you card ──────────────────────
    function renderPitch(): void {
        kicker.textContent = 'Fade Playground';
        title.textContent = hasLicense()
            ? 'Thank you for supporting Fade'
            : 'Support Fade’s development';

        body.className = 'license-nag-body-wrap';
        body.replaceChildren();
        const premise = document.createElement('div');
        premise.className = 'license-nag-body';
        premise.textContent = hasLicense()
            ? 'Your library has been used a great deal. If you’ve found Fade useful, a license is the best way to keep development going.'
            : `You’ve ${event === 'export' ? `exported ${count} times` : `compiled ${count} times`}. Fade is free, and it will stay free — no features are locked or gated. A paid license is purely a way to say thanks and help keep the project going.`;
        body.appendChild(premise);

        const divider = document.createElement('div');
        divider.className = 'license-nag-divider';
        body.appendChild(divider);

        const stepsTitle = document.createElement('div');
        stepsTitle.className = 'license-nag-steps-title';
        stepsTitle.textContent = 'Here’s how it works:';
        body.appendChild(stepsTitle);

        const steps = document.createElement('ul');
        steps.className = 'license-nag-steps';
        for (const s of [
            'Check out securely — no account needed.',
            'Your license key is emailed to you instantly.',
            'Paste it in Settings > License, or click the link, and you’re all set.',
        ]) {
            const li = document.createElement('li');
            li.className = 'license-nag-step ok';
            li.textContent = s;
            steps.appendChild(li);
        }
        body.appendChild(steps);

        // Footer actions.
        const actions = document.createElement('div');
        actions.className = 'license-nag-actions';

        const enterBtn = document.createElement('button');
        enterBtn.type = 'button';
        enterBtn.className = 'license-nag-btn';
        enterBtn.textContent = 'Enter Key';
        enterBtn.addEventListener('click', () => { renderEnter(); enterBtn.focus(); });
        actions.appendChild(enterBtn);

        let primaryBtn = enterBtn;
        if (cfg?.buyUrl) {
            const buyBtn = document.createElement('button');
            buyBtn.type = 'button';
            buyBtn.className = 'license-nag-btn license-nag-primary';
            buyBtn.textContent = 'Buy a license';
            buyBtn.addEventListener('click', () => window.open(cfg.buyUrl!, '_blank', 'noopener'));
            actions.appendChild(buyBtn);
            primaryBtn = buyBtn;
        }

        foot.replaceChildren();
        const dismissLink = document.createElement('button');
        dismissLink.className = 'license-nag-link';
        dismissLink.textContent = 'Not now';
        dismissLink.addEventListener('click', dismiss);
        foot.append(dismissLink, actions);

        shell.setEscape(dismiss);
        primaryBtn.focus();
    }

    // ── "Enter key" view: a single-purpose, comfortable key entry ─────
    function renderEnter(): void {
        kicker.textContent = 'Fade Playground';
        title.textContent = 'Enter your license key';

        body.className = 'license-enter-body';
        body.replaceChildren();

        const label = document.createElement('div');
        label.className = 'license-enter-label';
        label.textContent = 'License key';
        body.appendChild(label);

        const input = document.createElement('input');
        input.type = 'text';
        input.id = KEY_INPUT_ID;
        input.className = 'license-enter-input';
        input.placeholder = 'Paste your key here…';
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.autocapitalize = 'off';
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyKey(); });
        body.appendChild(input);

        const hint = document.createElement('div');
        hint.className = 'license-enter-hint';
        hint.textContent = 'Your key was emailed to you right after purchase. You can also open the emailed link to activate automatically.';
        body.appendChild(hint);

        const actions = document.createElement('div');
        actions.className = 'license-enter-actions';

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'license-nag-btn';
        backBtn.textContent = 'Back';
        backBtn.addEventListener('click', () => renderPitch());
        actions.appendChild(backBtn);

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'license-nag-btn license-nag-primary';
        applyBtn.textContent = 'Apply';
        applyBtn.addEventListener('click', applyKey);
        actions.appendChild(applyBtn);

        foot.replaceChildren(actions);
        shell.setEscape(renderPitch);
        input.focus();
    }

    // ── "Thank you" view: shown after a successful activation ─────────
    function renderThankYou(): void {
        kicker.textContent = 'Fade Playground';
        title.textContent = 'Thank you for supporting Fade';

        body.className = 'license-nag-body-wrap';
        body.replaceChildren();
        const message = document.createElement('div');
        message.className = 'license-nag-body';
        message.textContent = 'Your license is active. Fade stays free for everyone — thank you for helping keep development going.';
        const sub = document.createElement('div');
        sub.className = 'license-nag-body-muted';
        sub.textContent = 'You’ll find your key under Settings > License. No features are gated or affected.';
        body.append(message, sub);

        foot.replaceChildren();
        const actions = document.createElement('div');
        actions.className = 'license-nag-actions';
        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'license-nag-btn license-nag-primary';
        doneBtn.textContent = 'Done';
        doneBtn.addEventListener('click', dismiss);
        actions.appendChild(doneBtn);
        foot.appendChild(actions);

        shell.setEscape(dismiss);
        doneBtn.focus();
    }

    renderPitch();
}

// Open a standalone "thank you" popup after a successful activation, e.g.
// when the emailed ?key= link is opened on boot. Only fired for a real,
// just-applied token — never on a bare page load with no key.
export function showThankYouDialog(): void {
    if (nagOpen) return;
    const shell = openLicenseDialog();
    const { kicker, title, body, foot, dismiss } = shell;

    kicker.textContent = 'Fade Playground';
    title.textContent = 'Thank you for supporting Fade';

    body.className = 'license-nag-body-wrap';
    body.replaceChildren();
    const message = document.createElement('div');
    message.className = 'license-nag-body';
    message.textContent = 'Your license is active. Fade stays free for everyone — thank you for helping keep development going.';
    const sub = document.createElement('div');
    sub.className = 'license-nag-body-muted';
    sub.textContent = 'You’ll find your key under Settings > License. No features are gated or affected.';
    body.append(message, sub);

    foot.replaceChildren();
    const actions = document.createElement('div');
    actions.className = 'license-nag-actions';
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'license-nag-btn license-nag-primary';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', dismiss);
    actions.appendChild(doneBtn);
    foot.appendChild(actions);

    shell.setEscape(dismiss);
    doneBtn.focus();
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

    // Make sure a stored (but not-yet-verified) key is verified before we
    // decide whether to nag — otherwise a fresh reload could nag a licensed
    // user while the async verification is still in flight.
    await ensureVerified();

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
export async function applyLicenseFromUrl(): Promise<void> {
    try {
        const url = new URL(window.location.href);
        const key = url.searchParams.get('key');
        if (!key) return;

        const payload = decodeJwtPayload(key);
        if (!payload) return;
        // Verifies the Ed25519 signature; a forged key is rejected here.
        if (!(await storeLicense(key))) return;

        // Remove the secret param from the URL without a full reload. Doing
        // this up front also means a reload won't re-fire the welcome popup.
        url.searchParams.delete('key');
        window.history.replaceState(null, '', url.toString());

        pingTelemetry(payload.sub, 'activate');

        // Show the "thank you" popup for a fresh link activation. Deferred a
        // tick so the page's CSS variables/theming are mounted before render.
        setTimeout(() => showThankYouDialog(), 0);
    } catch {
        /* best effort */
    }
}
