import { buildRequestUrl } from 'src/control/core/dom/buildRequestUrl';

export type FetchOutcome =
    | { kind: 'success'; data: unknown }
    | { kind: 'error'; error: unknown }
    | { kind: 'aborted' };

/**
 * Returns a discriminated outcome — never throws. Aborted requests surface
 * as `{ kind: 'aborted' }` so the caller can drop them. URL resolution and
 * query-forwarding are delegated to `buildRequestUrl`.
 */
export async function runFetch(url: string, signal: AbortSignal): Promise<FetchOutcome> {
    try {
        const u = buildRequestUrl(url);
        const res = await fetch(u, { headers: { Accept: 'application/json' }, signal });
        if (!res.ok) return { kind: 'error', error: new Error(`HTTP ${res.status}`) };
        const data = await res.json() as unknown;
        return { kind: 'success', data };
    } catch (error) {
        if ((error as DOMException).name === 'AbortError') return { kind: 'aborted' };
        return { kind: 'error', error };
    }
}
