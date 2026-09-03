# Fade License Server

A stateless Cloudflare Worker that mints free-form JWTs for the Fade Playground
license system. **No storage.** Every license key is derived deterministically
from `(email, version)` using a UUID v5, so there is nothing to persist — the
same email + version always produces the same identity and the same signed JWT.

- JWT is HMAC-SHA256-signed (secret held as a Worker env var).
- `sub` = UUID v5 of `fade-licenses : ${email}:${version}` (version defaults to 1).
  Mint a `version: 2` JWT for the same email after a blacklist → brand-new identity.
- Revocation is a static `blacklist.json` served by the worker; the Playground
  fetches it on startup and shows the nag if a stored key's identity is listed.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/webhook` | Stripe signature | `checkout.session.completed` → mint + email |
| POST | `/mint` | `Bearer ADMIN_API_KEY` | Manual mint (curl-friendly) |
| POST | `/resend` | `Bearer ADMIN_API_KEY` | Re-derive + re-send a key by `session_id` |
| POST | `/telemetry` | none | Log a license check (fire-and-forget) |
| GET | `/blacklist.json` | none | Serve revoked identity UUIDs |
| GET | `/health` | none | Health check |

## Deploy

```sh
npm install

# Set secrets (encrypted at rest)
npx wrangler secret put HMAC_SECRET
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET   # only needed for /webhook
npx wrangler secret put RESEND_API_KEY

npx wrangler deploy
```

Non-secret config lives in `wrangler.toml` `[vars]`: `UUID_NAMESPACE`,
`FROM_EMAIL`, `PLAYGROUND_URL`. Adjust `FROM_EMAIL` to a domain you control
(resend requires a verified sending domain) and `PLAYGROUND_URL` to your real
Playground origin.

## CI & automated deploy

- **CI** (`.github/workflows/ci.yml` → `license-server` job): typechecks + runs
  the vitest suite on every push/PR. No secrets needed — tests use throwaway
  in-memory env.
- **Deploy** (`.github/workflows/deploy-license-server.yml`): on any push to
  `main` touching `license-server/**` (including `blacklist.json` — so a
  revocation ships by merging), installs then deploys the worker, and writes
  the secrets first via `wrangler secret put`.

  Required repo secrets (GitHub → Settings → Secrets → Actions):

  | Secret | Value |
  |--------|-------|
  | `CLOUDFLARE_API_TOKEN` | Workers Scripts: Edit (shared with Pages deploy) |
  | `CLOUDFLARE_ACCOUNT_ID` | the account owning `fade-license` |
  | `LICENSE_HMAC_SECRET` | random ≥32 bytes — signs every JWT |
  | `LICENSE_ADMIN_API_KEY` | bearer token for `/mint` + `/resend` |
  | `LICENSE_STRIPE_SECRET_KEY` | Stripe `sk_...` |
  | `LICENSE_STRIPE_WEBHOOK_SECRET` | Stripe `whsec_...` |
  | `LICENSE_RESEND_API_KEY` | Resend `re_...` |

  If you'd rather deploy manually first, run the deploy steps yourself
  (below) once to set secrets and push the worker; CI picks it up thereafter.

### Playground wiring (Points the site at this worker)

The Playground bakes two build-time env vars into the site (read in
`Playground/src/main.ts` via `import.meta.env`). These make the Buy button
and the enforcement/blacklist/telemetry calls live. Both are **optional** —
unset, the nag system ships inert.

Expose them as repo secrets and they flow through `_deploy-pages.yml`
(`secrets: inherit` from `deploy-prod.yml` / `deploy-test.yml`):

  | Secret | Value |
  |--------|-------|
  | `VITE_LICENSE_BUY_URL` | Your Stripe **Payment Link** URL, e.g. `https://buy.stripe.com/<id>` — Stripe hosts the whole checkout; the webhook below emails the key |
  | `VITE_LICENSE_SERVER_URL` | The deployed worker, e.g. `https://fade-license.<sub>.workers.dev` or the `--env` alias |

Set them once in GitHub → Settings → Secrets → Actions. No code change needed
after that; the next Playground release picks them up.


Unit + worker-routing tests (vitest, no network):

```sh
npm test
```

Local dev server (uses `.dev.vars`, copied from `.dev.vars.example`):

```sh
cp .dev.vars.example .dev.vars   # fill in real values (Stripe/Resend keys)
npm run dev
```

Then mint a key locally:

```sh
curl -X POST http://localhost:8787/mint \
  -H "Authorization: Bearer dev-admin-key" \
  -d '{"email":"buyer@example.com"}'
```

### How to test the full flow (before Stripe webhooks are wired)

The `/mint` endpoint is the manual path and the easiest thing to test without
any Stripe setup. It takes an email (and optional `version`) and — once
`RESEND_API_KEY` and `FROM_EMAIL` are set — emails the key. Point the returned
`?key=<jwt>` at your Playground URL to test the client-side import.

For the automated Stripe flow you do need the pieces below.

## Minting a key (production, manual MVP)

One-time sales before webhook automation, or replacement keys after a blacklist:

```sh
# v1 (default)
curl -X POST https://fade-license.<subdomain>.workers.dev/mint \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{"email":"buyer@example.com","name":"Jane"}'

# Replacement key for a blacklisted user — same email, version 2
curl -X POST https://fade-license.<subdomain>.workers.dev/mint \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{"email":"buyer@example.com","version":2}'
```

The worker emails the key + one-click activation link to the buyer via Resend.
If the email send fails, run `/resend` with the Stripe `session_id` and it
re-derives and re-sends (idempotent).

## Revoking a key

1. Add the identity UUID to the `revoked` array in `blacklist.json`.
2. Bump the `updated` timestamp.
3. `npx wrangler deploy`.

The Playground re-fetches `blacklist.json` on startup (short cache TTL) and
clears any stored key whose identity is listed.

## Why no KV

Every needed value is either an env var (secrets), bundled static JSON
(`blacklist.json`), or derivable from the Stripe session + email. So the whole
system runs on the Workers free tier with zero persistent state.

## Costs

- Cloudflare Workers: free tier
- Resend: free tier (100 emails/day)
- Stripe: 2.9% + $0.30 per transaction

Total fixed infrastructure cost: $0/month.

---

## Setting up the dependent services

### Resend (key emails)

1. Create an account at resend.com, verify a sending domain — **`brewed.ink`**.
2. Create an API key (`re_...`) with "Sending access".
3. Set `FROM_EMAIL` in `wrangler.toml` to a mailbox on that verified domain
   (e.g. `keys@brewed.ink`).
4. Create a **published** template with alias **`fade-purchase`** in Resend,
   declaring a string variable **`KEY`** (used as `{{{KEY}}}` in the template
   HTML). This is where the JWT gets injected.
5. Set `RESEND_TEMPLATE_ALIAS = "fade-purchase"` and `OWNER_EMAIL` (your inbox,
   e.g. `chris@brewed.ink`) in `wrangler.toml` `[vars]` — the owner gets a BCC
   copy of every key email.
6. Set `LICENSE_RESEND_API_KEY` repo secret (or `wrangler secret put RESEND_API_KEY`).

> The template must be **published**, not a draft, or Resend rejects the send.

### Stripe (payments → webhook)

1. In the Stripe Dashboard, create a **Checkout Session / Payment Link** for the
   product. Note the **Price ID** if you use the API, or just the Payment Link URL.
2. Optionally set a **webhook endpoint** in Stripe (Developers → Webhooks) →
   `Add endpoint` → URL = `https://fade-license.<subdomain>.workers.dev/webhook` →
   select the **`checkout.session.completed`** event. Stripe gives you a
   `whsec_...` signing secret — that's `LICENSE_STRIPE_WEBHOOK_SECRET`.
3. Grab your **secret key** (`sk_live_...` or `sk_test_...`) → that's
   `LICENSE_STRIPE_SECRET_KEY`.

> Note: the public webhook endpoint URL only exists after you `wrangler
> deploy`. Until then, use the Stripe CLI to forward events to your local
> `npm run dev` server (below) — no deploy needed.

### Do I need to deploy to test?

Not to test locally — `npm test` covers the mint/JWT/blacklist logic with zero
network, and `npm run dev` (wrangler) exercises the same code in the real
runtime against `.dev.vars`. You only deploy (`wrangler deploy` or a
push to `main`) when you want the live URL for Stripe webhooks to hit and
for the Playground to fetch the blacklist from.

---

## Detailed guide: testing the Stripe webhook locally with the Stripe CLI

This is the true end-to-end local test: Stripe → your local Worker → Resend
email. No deploy required, because the CLI tunnels real Stripe events into your
`npm run dev` server.

### 1. Install the Stripe CLI

```sh
brew install stripe/stripe-cli/stripe
stripe --version   # verify
```

### 2. Log in (test mode by default)

```sh
stripe login
```

This opens a browser and binds your CLI to your Stripe account. Keep it in
**Test mode** (the default) — you'll use `sk_test_...` keys.

### 3. Create your local `.dev.vars`

```sh
cd license-server
cp .dev.vars.example .dev.vars
```

Fill in four values:

| Key | Where to get it | Example |
|-----|-----------------|---------|
| `HMAC_SECRET` | generate: `openssl rand -hex 16` | `a91f...` |
| `ADMIN_API_KEY` | generate anything | `dev-admin-key` |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → **Test** `sk_test_...` | `sk_test_51...` |
| `RESEND_API_KEY` | Resend dashboard → API keys → `re_...` | `re_...` |
| `STRIPE_WEBHOOK_SECRET` | **fill in from step 5 below** — the CLI prints it | `whsec_...` |

`.dev.vars` is gitignored, so it won't be committed. Leave
`STRIPE_WEBHOOK_SECRET` blank for now — `stripe listen` overrides the signing
secret it uses, and you'll paste what it prints.

**Where the secrets come from, concretely:**
- **Stripe**: https://dashboard.stripe.com/test/apikeys → "Secret key"
  (`sk_test_...`). This is what the Worker uses to call Stripe and look up the
  buyer's email.
- **Webhook signing secret** (`whsec_...`): NOT in the dashboard — it's printed
  by `stripe listen` each time you start it. It's the shared secret Stripe uses
  to sign the webhook payload, which your Worker verifies.
- **Resend**: https://resend.com/keys → "Create API Key" (`re_...`). The Worker
  uses it to send the license email. Must send from the domain you verified in
  Resend (set as `FROM_EMAIL` in `wrangler.toml`).

### 4. Start the worker locally

```sh
cd license-server
npm run dev
```

Wrangler boots the Worker on `http://localhost:8787` and reads your `.dev.vars`.

### 5. Start the Stripe CLI tunnel (keeps running)

In a **second terminal**:

```sh
stripe listen --forward-to localhost:8787/webhook
```

Important output — it prints something like:

```
> Ready! You are listening for webhook events on http://localhost:8787/webhook
> Your webhook signing secret is whsec_xxxxxxxx...
```

Copy that `whsec_...` string into `.dev.vars` as `STRIPE_WEBHOOK_SECRET`, then
**restart `npm run dev`** so the Worker picks it up. Without it, every webhook
will be rejected as `invalid signature` (HTTP 400).

### 6. Trigger a real checkout completion

In a **third terminal**:

```sh
stripe trigger checkout.session.completed
```

The CLI fabricates a test event and forwards it through the tunnel. You should
see it land in the `stripe listen` terminal.

**Caveat about `stripe trigger`:** the synthetic session has **no real
customer**, so the Worker's `stripe.customers.retrieve()` lookup returns no
email and the email-to-buyer step is skipped (it logs
`could not resolve customer email`). `stripe trigger` proves:
- signature verification works (no 400)
- the routing reaches `/webhook`
- the handler parses `checkout.session.completed`

but not the email send.

### 7. (Recommended) Full end-to-end with a real customer

To also exercise email delivery, run a **real Checkout Session against your
test mode Payment Link**:

1. Open your sandbox **Payment Link** URL in a browser (from the Dashboard you
   set up in Test mode).
2. Use Stripe's test card: `4242 4242 4242 4242`, any future expiry, any CVC.
3. Complete checkout.
4. Stripe fires a real `checkout.session.completed` with a real `customer` that
   has the email you entered. Your local Worker mints a key and emails it via
   Resend.

You can also drive it non-interactively:

```sh
# create a test-mode Checkout Session
SESSION_ID=$(stripe payment_links retrieve <link_id> --output json | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# or, with a real session object:
stripe checkout sessions create \
  --success-url "https://example.com/success" \
  --cancel-url "https://example.com/cancel" \
  --line-items "[{\"price\":\"price_123\",\"quantity\":1}]"
```

Then open the returned `url` in a browser and pay with the test card.

### 8. Verify what shipped

- **Email**: check the Resend dashboard → "Logs" or your own inbox (the CLI
  email to a real address you entered).
- **Console**: the Worker logs in the `npm run dev` terminal
  (`telemetry`, `email send failed`, etc.).
- **Blacklist + `/mint`**: those need no Stripe at all — use the `curl`
  examples in the "Minting a key" section against `localhost:8787`.

### Handy CLI one-liners

```sh
# list your payment links (for the link_id above)
stripe payment_links list

# forward only the event you care about
stripe listen --forward-to localhost:8787/webhook --events checkout.session.completed

# capture the signing secret non-interactively
stripe listen --forward-to localhost:8787/webhook --print-secret
```
