// @vitest-environment jsdom

// License manager tests. jsdom is used for the localStorage / window /
// history the module touches; the rest (fetch, telemetry) is stubbed out so
// no network or DOM-nag fires during counter tests.
//
// License JWTs are now verified client-side with an Ed25519 PUBLIC key, so
// these tests mint real Ed25519-signed tokens with a throwaway keypair (via
// Node's WebCrypto, which jsdom's subtle doesn't implement) and hand the
// module the matching public key.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
    applyLicenseFromUrl,
    clearLicense,
    decodeJwtPayload,
    getLicense,
    hasLicense,
    maybeNag,
    readUsage,
    recordCompile,
    recordExport,
    setLicenseConfig,
    storeLicense,
} from './license';

// jsdom's crypto.subtle doesn't implement Ed25519 — use Node's real WebCrypto
// for both minting (here) and verification (inside the module under test).
beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

function bytesToB64url(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlJson(payload: unknown): string {
    const json = JSON.stringify(payload);
    let bin = '';
    for (let i = 0; i < json.length; i++) bin += String.fromCharCode(json.charCodeAt(i));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const VALID_PAYLOAD = {
    sub: 'uuid-here',
    email: 'chris@brewed.ink',
    name: 'Chris',
    iat: 1700000000,
    ver: 1,
};

// Throwaway Ed25519 keypair + a real signed JWT, minted once at module load.
let privateKey: CryptoKey;
let PUBLIC_KEY_JWK: import('./license').Ed25519JWK;
let VALID_JWT: string;

async function signJwt(payload: unknown): Promise<string> {
    const header = b64urlJson({ alg: 'EdDSA', typ: 'JWT' });
    const body = b64urlJson(payload);
    const data = new TextEncoder().encode(`${header}.${body}`);
    const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, data));
    return `${header}.${body}.${bytesToB64url(sig)}`;
}

beforeAll(async () => {
    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    privateKey = pair.privateKey;
    const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
    PUBLIC_KEY_JWK = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: jwk.x!,
        alg: 'EdDSA',
    };
    VALID_JWT = await signJwt(VALID_PAYLOAD);
});

beforeEach(() => {
    localStorage.clear();
    // Reset the in-memory verified cache too (localStorage.clear() doesn't
    // touch it) so each test starts unlicensed.
    clearLicense();
    document.querySelectorAll('.license-nag-overlay').forEach((el) => el.remove());
    vi.restoreAllMocks();
    // Give the module an embedded public key so storeLicense/verify succeed
    // offline, without hitting the (stubbed) network.
    setLicenseConfig({
        buyUrl: 'https://x/buy',
        blacklistUrl: 'https://x/blacklist.json',
        telemetryUrl: 'https://x/telemetry',
        publicKey: PUBLIC_KEY_JWK,
        publicKeyUrl: 'https://x/public-key',
    });
    // default: blacklist empty, telemetry no-op
    vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        json: async () => ({ revoked: [] }),
    })));
});

describe('decodeJwtPayload', () => {
    it('decodes a well-formed JWT payload', () => {
        const got = decodeJwtPayload(VALID_JWT);
        expect(got).not.toBeNull();
        expect(got?.sub).toBe('uuid-here');
        expect(got?.email).toBe('chris@brewed.ink');
        expect(got?.ver).toBe(1);
    });

    it('returns null for a malformed token', () => {
        expect(decodeJwtPayload('not-a-jwt')).toBeNull();
        expect(decodeJwtPayload('a.b')).toBeNull();
        expect(decodeJwtPayload('x.y.z')).toBeNull(); // unparseable payload
    });

    it('returns null when the payload lacks a sub', () => {
        expect(decodeJwtPayload(`eyJhbGciOiJFZERTQSJ9.${b64urlJson({ email: 'x@y.z' })}.sig`)).toBeNull();
    });
});

describe('store / read / clear license', () => {
    it('stores and reads back a valid license', async () => {
        await storeLicense(VALID_JWT);
        expect(hasLicense()).toBe(true);
        expect(getLicense()?.email).toBe('chris@brewed.ink');
    });

    it('ignores an invalid license on store', async () => {
        await storeLicense('garbage');
        expect(hasLicense()).toBe(false);
        expect(localStorage.getItem('fade.license')).toBeNull();
    });

    it('rejects a forged key whose signature does not verify (anti-minting)', async () => {
        // Same payload, but a bogus signature — must not be accepted even
        // though it decodes cleanly.
        await storeLicense(`eyJhbGciOiJFZERTQSJ9.${b64urlJson(VALID_PAYLOAD)}.bm90LXRoZS1yZWFsLXNpZ25hdHVyZQ`);
        expect(hasLicense()).toBe(false);
        expect(localStorage.getItem('fade.license')).toBeNull();
    });

    it('clear removes the stored license', async () => {
        await storeLicense(VALID_JWT);
        clearLicense();
        expect(hasLicense()).toBe(false);
    });
});

describe('usage counters', () => {
    // A stored valid (verified) license suppresses any nag/dialog while we
    // verify the counters, so the DOM path never fires during assertions.
    beforeEach(async () => { await storeLicense(VALID_JWT); });

    it('starts at zero and increments per record', () => {
        expect(readUsage()).toMatchObject({ exports: 0, compiles: 0 });
        recordExport();
        recordExport();
        recordExport();
        recordCompile();
        expect(readUsage()).toMatchObject({ exports: 3, compiles: 1 });
    });

    it('persists across a page refresh (localStorage round-trip)', () => {
        recordExport();
        recordCompile();
        const first = readUsage();

        // Simulate a refresh: re-read from the same localStorage source.
        const second = readUsage();
        expect(second).toEqual(first);
        // The raw record is actually in localStorage, durable across reloads.
        expect(localStorage.getItem('fade.licenseUsage')).toBeTruthy();
    });
});

describe('nag dialog', () => {
    it('renders the modal at the compile threshold without resetting the count', async () => {
        // No license installed → a due compile nag should actually render.
        clearLicense();
        localStorage.setItem('fade.licenseUsage', JSON.stringify({ exports: 0, compiles: 500 }));

        await maybeNag('compile');

        const overlay = document.querySelector('.license-nag-overlay');
        expect(overlay).not.toBeNull();
        expect(overlay?.textContent).toContain('compiled 500 times');
        // The lifetime count is NOT reset — only the nagged marker advances,
        // so a refresh keeps showing the true total.
        expect(readUsage().compiles).toBe(500);

        // Dismiss the modal (backdrop click) so it doesn't leak into the
        // next test and so nagOpen resets to false.
        overlay!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.querySelector('.license-nag-overlay')).toBeNull();
    });

    it('does not nag when a valid license is installed', async () => {
        await storeLicense(VALID_JWT);
        localStorage.setItem('fade.licenseUsage', JSON.stringify({ exports: 0, compiles: 500 }));

        await maybeNag('compile');

        expect(document.querySelector('.license-nag-overlay')).toBeNull();
        // No nag fired, so the count is untouched.
        expect(readUsage().compiles).toBe(500);
    });

    it('swaps to a focused key-entry view, then applies and shows the thank-you', async () => {
        clearLicense();
        localStorage.setItem('fade.licenseUsage', JSON.stringify({ exports: 0, compiles: 500 }));
        await maybeNag('compile');

        const overlay = document.querySelector('.license-nag-overlay')!;
        // Pitch view first: "Enter Key" button, no input yet.
        const enterBtn = Array.from(overlay.querySelectorAll('button'))
            .find((b) => b.textContent === 'Enter Key');
        expect(enterBtn).toBeTruthy();
        expect(document.getElementById('license-nag-key-input')).toBeNull();

        // Click → modal becomes a single-purpose key-entry view with a
        // comfortable full-width input that grabs focus.
        (enterBtn as HTMLButtonElement).click();
        const input = document.getElementById('license-nag-key-input') as HTMLInputElement | null;
        expect(input).not.toBeNull();
        expect(input!.className).toContain('license-enter-input');
        expect(document.activeElement).toBe(input);

        // Fill + Apply → key stored, dialog transitions to the thank-you view
        // (does not dismiss — the user confirms with Done).
        input!.value = VALID_JWT;
        const applyBtn = Array.from(overlay.querySelectorAll('button'))
            .find((b) => b.textContent === 'Apply');
        (applyBtn as HTMLButtonElement).click();
        // applyKey is async (awaits storeLicense's Ed25519 verification);
        // poll until the license lands (robust against macrotask scheduling).
        await vi.waitFor(() => expect(hasLicense()).toBe(true));

        expect(hasLicense()).toBe(true);
        // Still open, but now showing the thank-you.
        const overlay2 = document.querySelector('.license-nag-overlay')!;
        expect(overlay2.textContent).toContain('Thank you for supporting Fade');
        expect(Array.from(overlay2.querySelectorAll('button'))
            .some((b) => b.textContent === 'Done')).toBe(true);

        // Dismiss (Done / backdrop) so nagOpen resets and the popup doesn't
        // leak into later tests.
        overlay2.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.querySelector('.license-nag-overlay')).toBeNull();
    });

    it('shows an "invalid key" message when a bad key is applied', async () => {
        clearLicense();
        localStorage.setItem('fade.licenseUsage', JSON.stringify({ exports: 0, compiles: 500 }));
        await maybeNag('compile');

        const overlay = document.querySelector('.license-nag-overlay')!;
        const enterBtn = Array.from(overlay.querySelectorAll('button'))
            .find((b) => b.textContent === 'Enter Key');
        (enterBtn as HTMLButtonElement).click();

        const input = document.getElementById('license-nag-key-input') as HTMLInputElement | null;
        expect(input).not.toBeNull();
        // Bad signature — decodes but does not verify, so it must be rejected.
        input!.value = `eyJhbGciOiJFZERTQSJ9.${b64urlJson(VALID_PAYLOAD)}.bm90LXRoZS1yZWFsLXNpZ25hdHVyZQ`;

        const applyBtn = Array.from(overlay.querySelectorAll('button'))
            .find((b) => b.textContent === 'Apply');
        (applyBtn as HTMLButtonElement).click();

        // Stays on the enter view, no license stored, and an inline error shows.
        await vi.waitFor(() => {
            expect(document.getElementById('license-nag-key-error')!.style.display).toBe('block');
        });
        expect(hasLicense()).toBe(false);
        const errEl = document.getElementById('license-nag-key-error')!;
        expect(errEl.textContent).toMatch(/isn’t valid|not valid/i);
        expect(document.querySelector('.license-nag-overlay')!.textContent).toContain('Enter your license key');

        // Clear the key + retry with the real key succeeds and flips to the
        // thank-you view (which replaces the form, error element included).
        input!.value = VALID_JWT;
        (applyBtn as HTMLButtonElement).click();
        await vi.waitFor(() => expect(hasLicense()).toBe(true));

        overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.querySelector('.license-nag-overlay')).toBeNull();
    });
});

describe('applyLicenseFromUrl', () => {
    it('stores a key from the URL, strips it, and shows the thank-you popup', async () => {
        const url = new URL(window.location.href);
        url.searchParams.set('key', VALID_JWT);
        window.history.replaceState(null, '', url.toString());

        await applyLicenseFromUrl();

        expect(hasLicense()).toBe(true);
        expect(new URL(window.location.href).searchParams.has('key')).toBe(false);

        // Thank-you popup is deferred a tick; poll for it (robust against
        // macrotask scheduling of the deferred render).
        await vi.waitFor(() => {
            const el = document.querySelector('.license-nag-overlay');
            expect(el).not.toBeNull();
            expect(el?.textContent).toContain('Thank you for supporting Fade');
        });
        const overlay = document.querySelector('.license-nag-overlay')!;
        // Dismiss so it doesn't leak into later tests.
        overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(document.querySelector('.license-nag-overlay')).toBeNull();
    });

    it('does not show the popup when the URL has no key', async () => {
        window.history.replaceState(null, '', window.location.pathname);
        await applyLicenseFromUrl();
        expect(hasLicense()).toBe(false);
        expect(document.querySelector('.license-nag-overlay')).toBeNull();
    });
});

describe('blacklist', () => {
    // fetchBlacklist caches its result at module scope, so use a fresh
    // module instance per test to observe each stubbed fetch.
    let mod: typeof import('./license');
    beforeEach(async () => {
        vi.resetModules();
        mod = await import('./license');
        // fetchBlacklist/telemetry are no-ops without a config; give the fresh
        // module a fake server endpoint so the blacklist path is exercised.
        mod.setLicenseConfig({
            buyUrl: 'https://x/buy',
            blacklistUrl: 'https://x/blacklist.json',
            telemetryUrl: 'https://x/telemetry',
            publicKeyUrl: 'https://x/public-key',
        });
    });

    it('loads the revoked list and answers isBlacklisted', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ revoked: ['bad-uuid'] }),
        })));
        const list = await mod.fetchBlacklist();
        expect(list).toBeInstanceOf(Set);
        expect(mod.isBlacklisted('bad-uuid')).toBe(true);
        expect(mod.isBlacklisted('good-uuid')).toBe(false);
    });

    it('fails safe (empty set) when the server is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('network down');
        }));
        const list = await mod.fetchBlacklist();
        expect(list.size).toBe(0);
    });
});

describe('setLicenseConfig', () => {
    it('accepts a config object without throwing', () => {
        expect(() => setLicenseConfig({
            buyUrl: 'https://x/buy',
            blacklistUrl: 'https://x/blacklist.json',
            telemetryUrl: 'https://x/telemetry',
            publicKeyUrl: 'https://x/public-key',
        })).not.toThrow();
    });
});
