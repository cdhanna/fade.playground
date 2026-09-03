/**
 * Verify a Stripe webhook signature and parse the JSON body.
 * Uses Node's Web Crypto (HMAC-SHA256) — Stripe signs with HMAC-SHA256
 * over `timestamp.payload` using the `whsec_` secret.
 */

interface StripeEvent<T = unknown> {
    id: string;
    type: string;
    data: { object: T };
}

export async function verifyStripeWebhook(
    secret: string,
    bodyText: string,
    sigHeader: string | null,
): Promise<StripeEvent | null> {
    if (!secret || !sigHeader) return null;
    // t=123,v1=abc[,v0=...]
    const parts = sigHeader.split(',');
    let timestamp = '';
    let signature = '';
    for (const p of parts) {
        const [k, v] = p.split('=');
        if (k === 't') timestamp = v;
        if (k === 'v1') signature = v;
    }
    if (!timestamp || !signature) return null;

    const encoder = new TextEncoder();
    const signedPayload = `${timestamp}.${bodyText}`;
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
    );
    const expected = await crypto.subtle.verify(
        'HMAC',
        key,
        hexToBytes(signature) as unknown as BufferSource,
        encoder.encode(signedPayload) as unknown as BufferSource,
    );
    if (!expected) return null;

    try {
        return JSON.parse(bodyText) as StripeEvent;
    } catch {
        return null;
    }
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
