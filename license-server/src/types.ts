export interface Env {
    // Secrets (set via `wrangler secret put`)
    HMAC_SECRET: string;
    ADMIN_API_KEY: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    RESEND_API_KEY?: string;

    // Non-secret (wrangler.toml [vars])
    UUID_NAMESPACE: string;
    FROM_EMAIL: string;
    /** Friendly "from" display name, rendered as `Name <FROM_EMAIL>` */
    FROM_NAME: string;
    /** Subject line for the key email */
    EMAIL_SUBJECT: string;
    PLAYGROUND_URL: string;
    /** Resend published template alias (e.g. "fade-purchase") */
    RESEND_TEMPLATE_ALIAS: string;
    /** Your inbox — receives a BCC copy of every key email */
    OWNER_EMAIL: string;
}

export interface LicensePayload {
    /** Deterministic identity UUID: v5("fade-licenses", `${email}:${version}`) */
    sub: string;
    /** Customer email (may be absent in manually minted keys) */
    email?: string;
    /** Customer display name (may be absent) */
    name?: string;
    /** Unix epoch seconds when the license was issued */
    iat: number;
    /** JWT schema version (always 1 for now) */
    ver: number;
    /** UUID derivation version integer (not part of the JWT; visible in sub) */
    version?: number;
}

export interface UsageCounts {
    exports: number;
    compiles: number;
}
