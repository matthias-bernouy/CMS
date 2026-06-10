import BubblesEvent from "cms-control/core/dom/BubblesEvent";

const RELOAD_EVENT = "secret:saved";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Server interactions for `<cms-secrets>`. On 4xx the server returns
 * `{ error: "..." }` (cf. `withValidationResponse`); we surface the
 * message so the host can toast it. On success the reload event fires
 * so the host re-fetches and re-renders.
 */

export async function fetchSecrets(api: string): Promise<Array<{ key: string; value: string }>> {
    const res = await fetch(api, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Failed to load secrets');
    return res.json();
}

export async function postSecret(api: string, key: string, value: string): Promise<ActionResult> {
    const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
    });
    if (res.ok) { document.dispatchEvent(new BubblesEvent(RELOAD_EVENT)); return { ok: true }; }
    return { ok: false, error: await readError(res) };
}

export async function deleteSecret(api: string, key: string): Promise<ActionResult> {
    const url = `${api}?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (res.ok) { document.dispatchEvent(new BubblesEvent(RELOAD_EVENT)); return { ok: true }; }
    return { ok: false, error: await readError(res) };
}

async function readError(res: Response): Promise<string> {
    try {
        const body = await res.json();
        if (body && typeof body.error === 'string') return body.error;
    } catch { /* not JSON */ }
    return `HTTP ${res.status}`;
}

export const SECRETS_RELOAD_EVENT = RELOAD_EVENT;
