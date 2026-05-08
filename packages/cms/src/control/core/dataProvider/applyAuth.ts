import type { TDataAuth } from 'src/socle/interfaces/Data/data';

/**
 * Apply a `TDataAuth` to a `Headers` instance. Bearer tokens become the
 * standard `Authorization: Bearer <token>` header. Custom headers are
 * copied verbatim. `${VAR}` references are NOT resolved here — that's
 * the SecretStore's job, applied upstream of this helper.
 *
 * Reusable across the test-connection endpoint, the upcoming sync flow,
 * and any runtime proxy that forwards admin-saved auth to a third-party
 * API.
 */
export function applyAuth(auth: TDataAuth, headers: Headers): void {
    if (auth.type === 'bearer') {
        headers.set('Authorization', `Bearer ${auth.token}`);
        return;
    }
    if (auth.type === 'headers') {
        for (const h of auth.headers) {
            headers.set(h.name, h.value);
        }
    }
}
