import { describe, it, expect } from 'vitest';
import { deriveIdentity } from '../src/uuid';

const NS = 'fade-licenses';

describe('deriveIdentity (uuid v5)', () => {
    it('is deterministic for the same email + version', async () => {
        const a = await deriveIdentity(NS, 'buyer@example.com', 1);
        const b = await deriveIdentity(NS, 'buyer@example.com', 1);
        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('is a well-formed UUID v5 (version nibble = 5, variant = 8/9/a/b)', async () => {
        const id = await deriveIdentity(NS, 'x@y.com', 1);
        expect(id[14]).toBe('5');
        expect('89ab'.includes(id[19])).toBe(true);
    });

    it('produces different identities for different emails', async () => {
        const a = await deriveIdentity(NS, 'a@b.com', 1);
        const b = await deriveIdentity(NS, 'c@d.com', 1);
        expect(a).not.toBe(b);
    });

    it('produces different identities for different versions of the same email', async () => {
        const v1 = await deriveIdentity(NS, 'user@example.com', 1);
        const v2 = await deriveIdentity(NS, 'user@example.com', 2);
        expect(v1).not.toBe(v2);
    });
});
