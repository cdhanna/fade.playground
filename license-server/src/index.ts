/**
 * Fade license Worker.
 *
 * Routes:
 *   POST /webhook         Stripe checkout.session.completed → mint + email
 *   POST /mint            Admin endpooint — manual key minting
 *   POST /resend          Admin — re-derive + re-send a key by session_id
 *   POST /telemetry       Log a license check (fire-and-forget)
 *   GET  /blacklist.json  Serve revoked identity UUIDs
 *   GET  /health          Health check
 *
 * No storage. Keys are derived deterministically from (email, version).
 */

import type { Env, LicensePayload } from './types';
import { deriveIdentity } from './uuid';
import { signJwt } from './jwt';
import { sendLicenseEmail } from './email';
import { verifyStripeWebhook } from './stripe-verify';
import blacklist from '../blacklist.json';

interface MintResult {
    jwt: string;
    identity: string;
    version: number;
}

/**
 * Send the key email and log any failure. Returns true on success.
 * Resend failures don't throw (sendLicenseEmail returns {ok:false,error}),
 * so callers must check the result rather than rely on .catch.
 */
async function trySendEmail(env: Env, to: string, jwt: string): Promise<boolean> {
    if (!env.RESEND_API_KEY) {
        console.error('email skipped: RESEND_API_KEY not set');
        return false;
    }
    const result = await sendLicenseEmail({
        apiKey: env.RESEND_API_KEY,
        from: `${env.FROM_NAME} <${env.FROM_EMAIL}>`,
        subject: env.EMAIL_SUBJECT,
        to,
        toBcc: env.OWNER_EMAIL,
        templateAlias: env.RESEND_TEMPLATE_ALIAS,
        jwt,
    });
    if (!result.ok) {
        console.error('email send failed:', result.error);
        return false;
    }
    return true;
}

/** Shared minting logic. version defaults to 1. */
async function mint(env: Env, email: string, iat: number, opts: { name?: string; version?: number } = {}): Promise<MintResult> {
    const version = opts.version ?? 1;
    const identity = await deriveIdentity(env.UUID_NAMESPACE, email, version);
    const payload: LicensePayload = {
        sub: identity,
        email,
        ...(opts.name ? { name: opts.name } : {}),
        iat,
        ver: 1,
        version,
    };
    const jwt = await signJwt(payload, env.LICENSE_PRIVATE_KEY);
    return { jwt, identity, version };
}

const json = (obj: unknown, status = 200): Response =>
    new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

const requireAdmin = (env: Env, req: Request): boolean => {
    const auth = req.headers.get('Authorization') ?? '';
    return auth === `Bearer ${env.ADMIN_API_KEY}`;
};

const readBody = async (req: Request): Promise<Record<string, unknown>> => {
    try {
        return (await req.json()) as Record<string, unknown>;
    } catch {
        return {};
    }
};

/** POST /mint */
async function handleMint(env: Env, req: Request): Promise<Response> {
    if (!requireAdmin(env, req)) return json({ error: 'unauthorized' }, 401);
    const body = await readBody(req);
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email || !email.includes('@')) return json({ error: 'email required' }, 400);
    const version = typeof body.version === 'number' ? Math.max(1, Math.floor(body.version)) : 1;
    const name = typeof body.name === 'string' ? body.name : undefined;
    const iat = typeof body.iat === 'number' ? body.iat : Math.floor(Date.now() / 1000);
    const result = await mint(env, email, iat, { name, version });

    // Await so the caller learns whether the email was actually sent.
    const emailSent = await trySendEmail(env, email, result.jwt);
    return json({
        jwt: result.jwt,
        identity: result.identity,
        version: result.version,
        emailed: emailSent,
    });
}

/** POST /webhook */
async function handleWebhook(env: Env, req: Request): Promise<Response> {
    const raw = await req.text();
    const event = await verifyStripeWebhook(env.STRIPE_WEBHOOK_SECRET ?? '', raw, req.headers.get('Stripe-Signature'));
    if (!event) return json({ error: 'invalid signature' }, 400);
    if (event.type !== 'checkout.session.completed') return json({ received: true });

    const session = event.data.object as { id?: string; customer?: string };
    if (!session.id || !session.customer) return json({ error: 'missing session fields' }, 400);

    // Fetch customer email from Stripe.
    let email = '';
    let name: string | undefined;
    if (env.STRIPE_SECRET_KEY) {
        const custRes = await fetch(`https://api.stripe.com/v1/customers/${session.customer}`, {
            headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
        });
        if (custRes.ok) {
            const cust = (await custRes.json()) as { email?: string; name?: string };
            email = cust.email ?? '';
            name = cust.name;
        }
    }
    if (!email) return json({ error: 'could not resolve customer email' }, 400);

    const result = await mint(env, email, Math.floor(Date.now() / 1000), { name });
    await trySendEmail(env, email, result.jwt);
    return json({ received: true, identity: result.identity });
}

/** POST /resend */
async function handleResend(env: Env, req: Request): Promise<Response> {
    if (!requireAdmin(env, req)) return json({ error: 'unauthorized' }, 401);
    const body = await readBody(req);
    const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
    if (!sessionId) return json({ error: 'session_id required' }, 400);
    const version = typeof body.version === 'number' ? Math.max(1, Math.floor(body.version)) : 1;

    if (!env.STRIPE_SECRET_KEY) return json({ error: 'STRIPE_SECRET_KEY not configured' }, 500);
    const sessRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=customer`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    if (!sessRes.ok) return json({ error: 'session not found' }, 404);
    const session = (await sessRes.json()) as { customer?: { email?: string; name?: string } | string };
    // If expand worked, customer is an object; otherwise fetch it.
    let email = '';
    let name: string | undefined;
    if (typeof session.customer === 'object' && session.customer) {
        email = session.customer.email ?? '';
        name = session.customer.name;
    } else if (typeof session.customer === 'string') {
        const custRes = await fetch(`https://api.stripe.com/v1/customers/${session.customer}`, {
            headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
        });
        if (custRes.ok) {
            const cust = (await custRes.json()) as { email?: string; name?: string };
            email = cust.email ?? '';
            name = cust.name;
        }
    }
    if (!email) return json({ error: 'could not resolve customer email' }, 404);

    const result = await mint(env, email, Math.floor(Date.now() / 1000), { name, version });
    await trySendEmail(env, email, result.jwt);
    return json({ sent: true, identity: result.identity, version: result.version });
}

/** POST /telemetry */
async function handleTelemetry(env: Env, req: Request): Promise<Response> {
    const body = await readBody(req);
    // No identity is ever stored — just log for diagnostic purposes.
    console.log('telemetry', JSON.stringify(body));
    return json({ ok: true });
}

/** GET /blacklist.json */
function handleBlacklist(): Response {
    return new Response(JSON.stringify(blacklist), {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            // Short TTL so revocations propagate quickly; no long caching.
            'Cache-Control': 'public, max-age=60',
        },
    });
}

/** GET /public-key */
function handlePublicKey(env: Env): Response {
    let publicKey: unknown = env.LICENSE_PUBLIC_KEY;
    try {
        publicKey = JSON.parse(env.LICENSE_PUBLIC_KEY);
    } catch {
        /* fall back to serving the raw string */
    }
    return new Response(JSON.stringify({ publicKey }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            // Public — cache long so the Playground's verifier has it available
            // and flips to "Licensed" without a network round-trip each load.
            'Cache-Control': 'public, max-age=3600',
        },
    });
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const { pathname } = url;
        const method = request.method;

        // CORS: the Playground calls /public-key, /blacklist.json and
        // /telemetry cross-origin from the browser, so every response needs
        // the ACAO header and GET/POST requests that carry non-simple headers
        // require a handled OPTIONS preflight. Allow any origin (these
        // endpoints are public or token-gated). Webhook /mint /resend don't
        // need CORS, but a permissive header is harmless since they require
        // an Authorization token.
        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders() });
        }

        let response: Response;
        if (method === 'GET' && pathname === '/health') response = json({ ok: true });
        else if (method === 'GET' && pathname === '/blacklist.json') response = handleBlacklist();
        else if (method === 'GET' && pathname === '/public-key') response = handlePublicKey(env);
        else if (method === 'POST' && pathname === '/mint') response = await handleMint(env, request);
        else if (method === 'POST' && pathname === '/webhook') response = await handleWebhook(env, request);
        else if (method === 'POST' && pathname === '/resend') response = await handleResend(env, request);
        else if (method === 'POST' && pathname === '/telemetry') response = await handleTelemetry(env, request);
        else response = json({ error: 'not found' }, 404);

        const headers = new Headers(response.headers);
        for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
        response = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
        return response;
    },
};

/** CORS headers for all endpoints (allow any origin; endpoints are public or token-gated). */
function corsHeaders(): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
    };
}
