/**
 * Minimal HMAC-SHA256 JWT sign/verify using Web Crypto.
 * Compact form: base64url(header).base64url(payload).base64url(sig)
 */

import type { LicensePayload } from './types';

const encoder = new TextEncoder();

const HEADER = { alg: 'HS256', typ: 'JWT' };

function base64urlEncode(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function jsonToBase64url(obj: unknown): string {
    return base64urlEncode(encoder.encode(JSON.stringify(obj)));
}

async function hmacSign(secret: string, data: string): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

/** Sign a license payload into a compact JWT string. */
export async function signJwt(payload: LicensePayload, secret: string): Promise<string> {
    const header = jsonToBase64url(HEADER);
    const body = jsonToBase64url(payload);
    const signingInput = `${header}.${body}`;
    const sig = await hmacSign(secret, signingInput);
    return `${signingInput}.${base64urlEncode(sig)}`;
}

/** Parse (without verifying) the payload of a compact JWT. Returns null if malformed. */
export function decodeJwt(jwt: string): LicensePayload | null {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    try {
        const body = base64urlDecode(parts[1]);
        return JSON.parse(new TextDecoder().decode(body)) as LicensePayload;
    } catch {
        return null;
    }
}

/** Verify the HMAC signature of a compact JWT. Returns true if authentic. */
export async function verifyJwt(jwt: string, secret: string): Promise<boolean> {
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;
    const [header, body, sig] = parts;
    const expected = await hmacSign(secret, `${header}.${body}`);
    const given = base64urlDecode(sig);
    if (expected.length !== given.length) return false;
    // constant-time compare
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ given[i];
    return diff === 0;
}

/** btoa/atob aren't globally typed in some TS configs; provide them. */
declare function btoa(s: string): string;
declare function atob(s: string): string;
