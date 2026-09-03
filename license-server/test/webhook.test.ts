import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/types';
import { verifyJwt, decodeJwt } from '../src/jwt';

const HMAC = 'test-hmac-secret-abcdef0123456789';
const WH_SECRET = 'whsec_testsecret_000';
const RESEND = 're_test_000';

const env: Env = {
    HMAC_SECRET: HMAC,
    ADMIN_API_KEY: 'admin',
    STRIPE_SECRET_KEY: 'sk_test_000',
    STRIPE_WEBHOOK_SECRET: WH_SECRET,
    RESEND_API_KEY: RESEND,
    UUID_NAMESPACE: 'fade-licenses',
    FROM_EMAIL: 'keys@brewed.ink',
    FROM_NAME: 'Fade',
    EMAIL_SUBJECT: 'Your Fade license',
    PLAYGROUND_URL: 'https://playground.fadebasic.com',
    RESEND_TEMPLATE_ALIAS: 'fade-purchase',
    OWNER_EMAIL: 'chris@brewed.ink',
};

/**
 * Build a Stripe-signed `checkout.session.completed` payload exactly the way
 * Stripe does: HMAC-SHA256 over `timestamp.payload`, exported as
 * `t=<ts>,v1=<sig>` in the `Stripe-Signature` header.
 */
async function signedCheckoutCompleted(overrides: Record<string, unknown> = {}) {
    const payload = {
        id: 'evt_test_1',
        type: 'checkout.session.completed',
        data: {
            object: {
                id: 'cs_test_1',
                customer: 'cus_test_1',
                ...overrides,
            },
        },
    };
    const body = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(WH_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`));
    const sig = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return { body, headers: { 'Stripe-Signature': `t=${ts},v1=${sig}` } };
}

/** Mock the worker's outbound network calls (Stripe + Resend) so no real API is hit. */
function mockNetwork() {
    const sent: {
        emails: number;
        lastEmailTo: string;
        lastEmailBcc: string;
        lastFrom: string;
        lastSubject: string;
        lastTemplateId: string;
        lastKey: string;
    } = { emails: 0, lastEmailTo: '', lastEmailBcc: '', lastFrom: '', lastSubject: '', lastTemplateId: '', lastKey: '' };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const u = typeof url === 'string' ? url : (url as Request).url;
        if (u.includes('api.stripe.com/v1/customers/cus_test_1')) {
            return new Response(JSON.stringify({ email: 'buyer@example.com', name: 'Jane Doe' }), { status: 200 });
        }
        if (u.includes('api.resend.com/emails')) {
            const parsed = JSON.parse(String(init?.body));
            sent.emails++;
            sent.lastEmailTo = parsed.to?.[0] ?? '';
            sent.lastEmailBcc = parsed.bcc?.[0] ?? '';
            sent.lastFrom = parsed.from ?? '';
            sent.lastSubject = parsed.subject ?? '';
            sent.lastTemplateId = parsed.template?.id ?? '';
            sent.lastKey = parsed.template?.variables?.KEY ?? '';
            return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
        }
        throw new Error(`unexpected fetch: ${u}`);
    }));
    return sent;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('license worker /webhook', () => {
    it('rejects a request with a missing/invalid Stripe signature', async () => {
        const res = await worker.fetch(
            new Request('https://license.workers.dev/webhook', {
                method: 'POST',
                body: '{}',
                headers: {},
            }),
            env,
        );
        expect(res.status).toBe(400);
    });

    it('mints + emails a key on a valid checkout.session.completed', async () => {
        const sent = mockNetwork();
        const { body, headers } = await signedCheckoutCompleted();
        const res = await worker.fetch(
            new Request('https://license.workers.dev/webhook', { method: 'POST', body, headers }),
            env,
        );
        expect(res.status).toBe(200);
        const respBody = (await res.json()) as { received: boolean; identity: string };
        expect(respBody.received).toBe(true);
        expect(respBody.identity).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

        // The email used the fade-purchase template, sent to the buyer
        // with a BCC to the owner, and the KEY variable holds the JWT.
        expect(sent.emails).toBe(1);
        expect(sent.lastEmailTo).toBe('buyer@example.com');
        expect(sent.lastEmailBcc).toBe('chris@brewed.ink');
        expect(sent.lastFrom).toBe('Fade <keys@brewed.ink>');
        expect(sent.lastSubject).toBe('Your Fade license');
        expect(sent.lastTemplateId).toBe('fade-purchase');
        const jwt = sent.lastKey;
        expect(jwt).toBeTruthy();
        expect(await verifyJwt(jwt, HMAC)).toBe(true);
        const decoded = decodeJwt(jwt);
        expect(decoded?.email).toBe('buyer@example.com');
        expect(decoded?.sub).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('acks (200) non-checkout events without minting', async () => {
        const sent = mockNetwork();
        const payload = JSON.stringify({ id: 'evt_2', type: 'invoice.paid', data: { object: {} } });
        const ts = Math.floor(Date.now() / 1000);
        const key = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(WH_SECRET),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
        );
        const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`));
        const sig = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
        const res = await worker.fetch(
            new Request('https://license.workers.dev/webhook', {
                method: 'POST',
                body: payload,
                headers: { 'Stripe-Signature': `t=${ts},v1=${sig}` },
            }),
            env,
        );
        expect(res.status).toBe(200);
        expect(sent.emails).toBe(0); // no key email for non-checkout events
    });
});
