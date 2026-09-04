// Ed25519 test keypair. Generated with scripts/generate-keys.mjs — this is a
// throwaway key used ONLY by the test suite (a real key is generated per
// environment and the private half is set as a Workers secret, never committed).
//
// Private = base64 PKCS8, Public = Ed25519 JWK. TEST_PUBLIC_KEY_JWK is the
// canonical form the worker serves at /public-key.
import type { Ed25519JWK } from '../src/jwt';

export const TEST_PRIVATE_KEY =
    'MC4CAQAwBQYDK2VwBCIEIBv8Lv/RpHR24OvFFIAGWwgwk9gkVmBa0DbcuTJ+MCdP';
export const TEST_PUBLIC_KEY_JWK: Ed25519JWK = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: 'cQ3delXFiT_EP7OTkY-Kn7LUd2tfAfkR2DW1--xW50Y',
    alg: 'EdDSA',
};
