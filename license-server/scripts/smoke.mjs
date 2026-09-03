#!/usr/bin/env node
/**
 * Local smoke test for the license Worker's live HTTP surface.
 *
 * Requires `npm run dev` already running (wrangler on localhost:8787) and a
 * `.dev.vars` file (copy `.dev.vars.example`). It exercises:
 *   GET  /health
 *   GET  /blacklist.json
 *   POST /mint            (auth, happy path, versioning)
 *   POST /webhook         (a Stripe-signed checkout.session.completed)
 *
 * Usage:
 *   node scripts/smoke.mjs                # against http://localhost:8787
 *   BASE=http://localhost:8787 node scripts/smoke.mjs
 *
 * Exit 0 if all pass, 1 otherwise. Mirrors the Playground probe convention.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE || 'http://localhost:8787').replace(/\/$/, '');

// Parse .dev.vars (simple KEY=VALUE lines, # comments)
function loadEnvVars() {
    const out = {};
    const raw = readFileSync(join(__dir, '..', '.dev.vars'), 'utf8');
    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq === -1) continue;
        out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
    return out;
}

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) {
        console.log(`  ✓ ${name}`);
    } else {
        failures++;
        console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    }
};

// Stripe webhook signing — matches the real format: t=<ts>,v1=hmac(ts.payload)
function signedWebhook(secret, payload) {
    const body = JSON.stringify(payload);
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    return { body, headers: { 'Stripe-Signature': `t=${t},v1=${sig}` } };
}

async function main() {
    const envVars = loadEnvVars();
    const admin = envVars.ADMIN_API_KEY || 'dev-admin-key';
    const whSecret = envVars.STRIPE_WEBHOOK_SECRET;
    const hmac = envVars.HMAC_SECRET;

    console.log(`Smoke-testing ${BASE}\n`);

    // 1. health
    console.log('health');
    let res = await fetch(`${BASE}/health`);
    check('GET /health -> 200', res.status === 200);

    // 2. blacklist
    console.log('blacklist');
    res = await fetch(`${BASE}/blacklist.json`);
    check('GET /blacklist.json -> 200', res.status === 200);
    const bl = await res.json();
    check('blacklist has revoked[] array', Array.isArray(bl.revoked));
    check('blacklist has updated timestamp', typeof bl.updated === 'string');

    // 3. mint requires auth
    console.log('mint');
    res = await fetch(`${BASE}/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'buyer@example.com' }),
    });
    check('POST /mint without auth -> 401', res.status === 401);

    // 4. mint happy path
    res = await fetch(`${BASE}/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
        body: JSON.stringify({ email: 'buyer@example.com' }),
    });
    check('POST /mint with auth -> 200', res.status === 200);
    const m1 = await res.json();
    check('mint returns {jwt, identity}', !!(m1.jwt && m1.identity));
    check('identity is a UUID v5', /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab]/.test(m1.identity));

    // 5. mint versioning (distinct identity, same email)
    res = await fetch(`${BASE}/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
        body: JSON.stringify({ email: 'buyer@example.com', version: 2 }),
    });
    const m2 = await res.json();
    check('version:2 yields a different identity', m2.identity && m2.identity !== m1.identity);

    // 6. webhook (only if a whsec is configured, else warn+skip)
    console.log('webhook');
    if (!whSecret) {
        console.warn('  ⚠ STRIPE_WEBHOOK_SECRET not set in .dev.vars — skipping webhook check');
    } else {
        const { body, headers } = signedWebhook(whSecret, {
            id: 'evt_smoke_1',
            type: 'checkout.session.completed',
            data: { object: { id: 'cs_smoke_1', customer: 'cus_smoke_1' } },
        });
        res = await fetch(`${BASE}/webhook`, {
            method: 'POST',
            headers,
            body,
        });
        const bodyText = await res.text();
        let j = {};
        try { j = JSON.parse(bodyText); } catch {}

        // Signature verification is proven by the fact that we did NOT get
        // "invalid signature" (400). With real Stripe credentials + a real
        // customer, the handler mints + emails and returns 200 received:true.
        // With the fake/synthetic customer in this smoke test, the Stripe
        // lookup fails and it correctly returns 400 with
        // "could not resolve customer email" — also proof the signature passed.
        const badSig = res.status === 400 && j.error === 'invalid signature';
        check('POST /webhook — signature accepted (not "invalid signature")', !badSig, bodyText.slice(0, 120));
        check(
            'webhook reached handler (received or customer-resolution failure)',
            j.received === true || j.error === 'could not resolve customer email',
            bodyText.slice(0, 120),
        );
    }

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILED`}`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error('smoke test crashed:', e);
    process.exit(1);
});
