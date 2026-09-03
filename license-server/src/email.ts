/**
 * Send license-key emails via Resend's HTTP API using a published template.
 * No SDK dependency — just a fetch to https://api.resend.com/emails.
 *
 * The template is referenced by its alias (`RESEND_TEMPLATE_ALIAS`, e.g.
 * "fade-purchase"). It must declare a string variable `KEY` (triple-brace
 * `{{{KEY}}}` in the template HTML) into which we substitute the JWT.
 *
 * When sending with a template you may NOT also pass html/text/react. The
 * `from`/`subject` in the payload override the template's defaults.
 */

interface SendLicenseEmailInput {
    apiKey: string;
    from: string;
    subject: string;
    to: string;
    toBcc: string;
    templateAlias: string;
    jwt: string;
}

export async function sendLicenseEmail(input: SendLicenseEmailInput): Promise<{ ok: boolean; error?: string }> {
    const { apiKey, from, subject, to, toBcc, templateAlias, jwt } = input;

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            from,
            to: [to],
            bcc: [toBcc],
            subject,
            // Template `id` accepts the published template's alias.
            template: {
                id: templateAlias,
                variables: {
                    KEY: jwt,
                },
            },
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Resend error ${res.status}: ${text}` };
    }
    return { ok: true };
}
