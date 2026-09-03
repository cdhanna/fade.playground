import { describe, it, expect } from 'vitest';
import { signJwt, decodeJwt, verifyJwt } from '../src/jwt';

const SECRET = 'test-secret-key-that-is-long-enough';

describe('jwt', () => {
    it('signs, decodes, and verifies a payload', async () => {
        const payload = {
            sub: '550e8400-e29b-41d4-a716-446655440000',
            email: 'buyer@example.com',
            iat: 1756771200,
            ver: 1,
            version: 1,
        };
        const jwt = await signJwt(payload, SECRET);
        expect(jwt.split('.')).toHaveLength(3);
        expect(await verifyJwt(jwt, SECRET)).toBe(true);
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
        const jwt = await signJwt(payload, SECRET);
        const [h, b, s] = jwt.split('.');
        const tampered = `${h}.${b.slice(0, b.length - 1)}x.${s}`;
        expect(await verifyJwt(tampered, SECRET)).toBe(false);
    });

    it('rejects signature from a different secret', async () => {
        const payload = { sub: 'foo', email: 'a@b.com', iat: 1, ver: 1 };
        const jwt = await signJwt(payload, SECRET);
        expect(await verifyJwt(jwt, 'wrong-secret-key-that-is-different')).toBe(false);
    });

    it('returns null on malformed JWT', () => {
        expect(decodeJwt('not-a-jwt')).toBeNull();
        expect(decodeJwt('a.b')).toBeNull();
    });
});
