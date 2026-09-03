// @vitest-environment jsdom

// License manager tests. jsdom is used for the localStorage / window /
// history the module touches; geoff the rest (fetch, telemetry) is stubbed
// out so no network or DOM-nag fires during counter tests.

import { describe, it, expect, beforeEach, vi } from 'vitest';
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

// Encode a payload object as a base64url JWT middle segment (no real
// signature needed — we only ever decode here).
function b64urlJson(payload: unknown): string {
    const json = JSON.stringify(payload);
    let bin = '';
    for (let i = 0; i < json.length; i++) bin += String.fromCharCode(json.charCodeAt(i));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(payload: unknown): string {
    // header.payload.signature — three dot-separated parts
    return `eyJhbGciOiJIUzI1NiJ9.${b64urlJson(payload)}.fake-signature`;
}

const VALID_PAYLOAD = {
    sub: 'uuid-here',
    email: 'chris@brewed.ink',
    name: 'Chris',
    iat: 1700000000,
    ver: 1,
};
const VALID_JWT = makeJwt(VALID_PAYLOAD);

beforeEach(() => {
    localStorage.clear();
    document.querySelectorAll('.license-nag-overlay').forEach((el) => el.remove());
    vi.restoreAllMocks();
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
        expect(decodeJwtPayload(makeJwt({ email: 'x@y.z' }))).toBeNull();
    });
});

describe('store / read / clear license', () => {
    it('stores and reads back a valid license', () => {
        storeLicense(VALID_JWT);
        expect(hasLicense()).toBe(true);
        expect(getLicense()?.email).toBe('chris@brewed.ink');
    });

    it('ignores an invalid license on store', () => {
        storeLicense('garbage');
        expect(hasLicense()).toBe(false);
        expect(localStorage.getItem('fade.license')).toBeNull();
    });

    it('clear removes the stored license', () => {
        storeLicense(VALID_JWT);
        clearLicense();
        expect(hasLicense()).toBe(false);
    });
});

describe('usage counters', () => {
    // A stored valid license suppresses any nag/dialog while we verify the
    // counters, so the DOM path never fires during these assertions.
    beforeEach(() => storeLicense(VALID_JWT));

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
        storeLicense(VALID_JWT);
        localStorage.setItem('fade.licenseUsage', JSON.stringify({ exports: 0, compiles: 500 }));

        await maybeNag('compile');

        expect(document.querySelector('.license-nag-overlay')).toBeNull();
        // No nag fired, so the count is untouched.
        expect(readUsage().compiles).toBe(500);
    });
});

describe('applyLicenseFromUrl', () => {
    it('stores a key from the URL and strips it from the address', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('key', VALID_JWT);
        window.history.replaceState(null, '', url.toString());

        applyLicenseFromUrl();

        expect(hasLicense()).toBe(true);
        expect(new URL(window.location.href).searchParams.has('key')).toBe(false);
    });

    it('leaves the URL alone when no key is present', () => {
        window.history.replaceState(null, '', window.location.pathname);
        applyLicenseFromUrl();
        expect(hasLicense()).toBe(false);
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
        })).not.toThrow();
    });
});
