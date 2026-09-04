// Generate an Ed25519 keypair for the Fade license system.
//
//   node scripts/generate-keys.mjs
//
// Prints:
//   - LICENSE_PRIVATE_KEY  (base64 PKCS8 — SECRET, set via `wrangler secret put`)
//   - LICENSE_PUBLIC_KEY   (base64 raw RFC8032 public key — public, put in
//                           wrangler.toml [vars] and served at /public-key)
//
// Store only the private key as a secret. The public key is safe to share —
// the browser verifies with it but can't mint.

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

const { privateKey, publicKey } = await crypto.subtle.generateKey(
    'Ed25519', true, ['sign', 'verify'],
);

const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
const raw = await crypto.subtle.exportKey('raw', publicKey);

console.log('LICENSE_PRIVATE_KEY=' + b64(pkcs8));
console.log('LICENSE_PUBLIC_KEY=' + b64(raw));
console.log('');
console.log('Set the private key as a Workers secret:');
console.log('  cd license-server && echo "LICENSE_PRIVATE_KEY=<base64>" | wrangler secret put LICENSE_PRIVATE_KEY');
console.log('');
console.log('Put the public key in wrangler.toml [vars]:');
console.log('  LICENSE_PUBLIC_KEY = "<base64>"');
