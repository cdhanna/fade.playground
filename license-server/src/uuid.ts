/**
 * UUID v5 (SHA-1 name-based) derivation. Deterministic: same (namespace,
 * name) always yields the same UUID. Used to derive a stable license
 * identity from `email:version` without storing anything.
 *
 * Uses Web Crypto (`crypto.subtle.digest('SHA-1', ...)`), which is
 * available in Cloudflare Workers, browsers, and Node 15+ (via global
 * crypto). This keeps the derivation identical on every runtime that
 * needs it (worker mints, node tests, browser Playground if it ever
 * re-derives locally).
 */

const encoder = new TextEncoder();

async function sha1Bytes(data: Uint8Array): Promise<Uint8Array> {
    const buf = await crypto.subtle.digest('SHA-1', data as unknown as BufferSource);
    return new Uint8Array(buf);
}

// The RFC 4122 "DNS" namespace UUID, used as the seed for `namespace`.
// We derive the final namespace as v5(DNS, namespaceName) so a human
// string like "fade-licenses" maps deterministically to a UUID.
const DNS_NAMESPACE = new Uint8Array([
    0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1,
    0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
]);

async function v5(namespaceName: string, name: string): Promise<string> {
    // namespace = v5(DNS, namespaceName) — materialize the string namespace.
    const ns = await sha1Bytes(bytesConcat(DNS_NAMESPACE, encoder.encode(namespaceName)));
    ns[6] = (ns[6] & 0x0f) | 0x50;
    ns[8] = (ns[8] & 0x3f) | 0x80;

    // hash = sha1(namespaceBytes || nameBytes)
    const hash = await sha1Bytes(bytesConcat(ns.slice(0, 16), encoder.encode(name)));
    hash[6] = (hash[6] & 0x0f) | 0x50;
    hash[8] = (hash[8] & 0x3f) | 0x80;

    const hex = Array.from(hash.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function bytesConcat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}

/**
 * Derived license identity:
 *   sub = v5(UUID_NAMESPACE, `${email}:${version}`)
 */
export async function deriveIdentity(namespace: string, email: string, version: number): Promise<string> {
    return v5(namespace, `${email}:${version}`);
}
