import { describe, it, expect } from 'vitest';
import { signJwt, decodeJwt, verifyJwt } from '../src/jwt';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './keys';

describe('jwt (Ed25519)', () => {
    it('signs, decodes, and verifies a payload', async () => {
        const payload = {
            sub: '550e8400-e29b-41d4-a716-446655440000',
            email: 'buyer@example.com',
            iat: 1756771200,
            ver: 1,
            version: 1,
        };
        const jwt = await signJwt(payload, TEST_PRIVATE_KEY);
        expect(jwt.split('.')).toHaveLength(3);
        expect(await verifyJwt(jwt, TEST_PUBLIC_KEY)).toBe(true);
        const decoded = decodeJwt(jwt);
        expect(decoded).toMatchObject({
            sub: payload.sub,
            email: payload.email,
            iat: payload.iat,
            ver: 1,
        });
    });

    it('rejects tampered payloads', async () => {
        const payload = { sub: 'foo', email: 'a@b.com', iat: 1, ver: 1 };
        const jwt = await signJwt(payload, TEST_PRIVATE_KEY);
        const [h, b, s] = jwt.split('.');
        const tampered = `${h}.${b.slice(0, b.length - 1)}x.${s}`;
        expect(await verifyJwt(tampered, TEST_PUBLIC_KEY)).toBe(false);
    });

    it('rejects a signature minted with a DIFFERENT key (cannot be forged)', async () => {
        // An attacker who cannot read our private key would have to sign with
        // their own key. Such a token must NOT verify against our public key —
        // that's the anti-minting guarantee.
        const { privateKey: forger } = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
        const payload = { sub: 'foo', email: 'a@b.com', iat: 1, ver: 1 };
        const forged = await signJwt(
            payload,
            Buffer.from(await crypto.subtle.exportKey('pkcs8', forger)).toString('base64'),
        );
        expect(await verifyJwt(forged, TEST_PUBLIC_KEY)).toBe(false);
        expect(decodeJwt(forged)?.email).toBe('a@b.com'); // payload decodes, sig is what rejects it
    });

    it('returns null on malformed JWT', () => {
        expect(decodeJwt('not-a-jwt')).toBeNull();
        expect(decodeJwt('a.b')).toBeNull();
    });
});
