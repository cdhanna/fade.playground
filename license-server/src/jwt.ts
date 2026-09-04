/**
 * Ed25519 (EdDSA) JWT sign/verify using Web Crypto.
 * Compact form: base64url(header).base64url(payload).base64url(sig)
 *
 * Asymmetric, so the SIGNING key (private) never leaves the server while
 * anyone can VERIFY with the public key. This lets the Playground prove a
 * key was minted by us without ever holding the private key.
 *
 * Key material (see scripts/generate-keys.mjs):
 *   - private key: base64 of the PKCS8 DER export
 *   - public key : base64 of the raw 32-byte RFC 8032 public key
 */

import type { LicensePayload } from './types';

const encoder = new TextEncoder();

const HEADER = { alg: 'EdDSA', typ: 'JWT' };

function base64urlEncode(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

function base64ToBytes(str: string): Uint8Array | null {
    try {
        const bin = atob(str);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    } catch {
        return null;
    }
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

async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
    const der = base64ToBytes(privateKeyBase64);
    if (!der) throw new Error('bad private key');
    return crypto.subtle.importKey('pkcs8', der as unknown as ArrayBuffer, { name: 'Ed25519' }, false, ['sign']);
}

async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
    const raw = base64ToBytes(publicKeyBase64);
    if (!raw) throw new Error('bad public key');
    return crypto.subtle.importKey('raw', raw as unknown as ArrayBuffer, { name: 'Ed25519' }, false, ['verify']);
}

/** Sign a license payload into a compact JWT using the Ed25519 private key. */
export async function signJwt(payload: LicensePayload, privateKeyBase64: string): Promise<string> {
    const privateKey = await importPrivateKey(privateKeyBase64);
    const header = jsonToBase64url(HEADER);
    const body = jsonToBase64url(payload);
    const signingInput = `${header}.${body}`;
    const sig = await crypto.subtle.sign('Ed25519', privateKey, encoder.encode(signingInput));
    return `${signingInput}.${base64urlEncode(new Uint8Array(sig))}`;
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

/** Verify the Ed25519 signature of a compact JWT against the public key. */
export async function verifyJwt(jwt: string, publicKeyBase64: string): Promise<boolean> {
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;
    const [header, body, sigB64] = parts;
    let publicKey: CryptoKey;
    try {
        publicKey = await importPublicKey(publicKeyBase64);
    } catch {
        return false;
    }
    try {
        return await crypto.subtle.verify(
            'Ed25519',
            publicKey,
            base64urlDecode(sigB64) as unknown as ArrayBuffer,
            encoder.encode(`${header}.${body}`),
        );
    } catch {
        return false;
    }
}

/** btoa/atob aren't globally typed in some TS configs; provide them. */
declare function btoa(s: string): string;
declare function atob(s: string): string;
