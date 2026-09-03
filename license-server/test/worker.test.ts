import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/types';
import { deriveIdentity } from '../src/uuid';
import { verifyJwt, decodeJwt } from '../src/jwt';

const HMAC = 'test-hmac-secret-abcdef0123456789';
const ADMIN = 'test-admin-key';

const env: Env = {
    HMAC_SECRET: HMAC,
    ADMIN_API_KEY: ADMIN,
    STRIPE_SECRET_KEY: '', // not used in these tests
    STRIPE_WEBHOOK_SECRET: '',
    RESEND_API_KEY: '', // no email in these tests
    UUID_NAMESPACE: 'fade-licenses',
    FROM_EMAIL: 'keys@brewed.ink',
    FROM_NAME: 'Fade',
    EMAIL_SUBJECT: 'Your Fade license',
    PLAYGROUND_URL: 'https://playground.fadebasic.com',
    RESEND_TEMPLATE_ALIAS: 'fade-purchase',
    OWNER_EMAIL: 'chris@brewed.ink',
};

async function call(req: { path: string; method?: string; body?: unknown; headers?: Record<string, string> }) {
    const { path, method = 'GET', body, headers = {} } = req;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
        init.headers = { ...headers, 'Content-Type': 'application/json' };
        init.body = JSON.stringify(body);
    }
    return worker.fetch(new Request(`https://license.workers.dev${path}`, init), env);
}

describe('license worker', () => {
    it('GET /health returns ok', async () => {
        const res = await call({ path: '/health' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
    });

    it('GET /blacklist.json serves the revoked list', async () => {
        const res = await call({ path: '/blacklist.json' });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { revoked: string[]; updated: string };
        expect(Array.isArray(body.revoked)).toBe(true);
        expect(typeof body.updated).toBe('string');
    });

    it('POST /mint requires admin auth', async () => {
        const res = await call({ path: '/mint', method: 'POST', body: { email: 'a@b.com' } });
        expect(res.status).toBe(401);
    });

    it('POST /mint mints a valid, deterministic JWT', async () => {
        const res = await call({
            path: '/mint',
            method: 'POST',
            body: { email: 'buyer@example.com' },
            headers: { Authorization: `Bearer ${ADMIN}` },
        });
        expect(res.status).toBe(200);
        const { jwt, identity } = (await res.json()) as { jwt: string; identity: string };

        expect(await verifyJwt(jwt, HMAC)).toBe(true);
        const decoded = decodeJwt(jwt);
        expect(decoded?.email).toBe('buyer@example.com');
        expect(decoded?.sub).toBe(identity);
        expect(decoded?.version).toBe(1);

        // Deterministic: re-deriving gives the same identity.
        const expectedSub = await deriveIdentity('fade-licenses', 'buyer@example.com', 1);
        expect(identity).toBe(expectedSub);
        expect(identity).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('POST /mint honors a custom version (distinct identity but same email)', async () => {
        const mk = (v: number) =>
            call({
                path: '/mint',
                method: 'POST',
                body: { email: 'buyer@example.com', version: v },
                headers: { Authorization: `Bearer ${ADMIN}` },
            });

        const r1 = await mk(1);
        const r2 = await mk(2);
        const i1 = ((await r1.json()) as { identity: string }).identity;
        const i2 = ((await r2.json()) as { identity: string }).identity;
        expect(i1).not.toBe(i2);
    });

    it('POST /mint rejects missing email', async () => {
        const res = await call({
            path: '/mint',
            method: 'POST',
            body: {},
            headers: { Authorization: `Bearer ${ADMIN}` },
        });
        expect(res.status).toBe(400);
    });

    it('unknown route returns 404', async () => {
        const res = await call({ path: '/nope' });
        expect(res.status).toBe(404);
    });
});
