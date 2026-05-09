import type { SecretStore } from 'src/socle/interfaces/SecretStore';
import { SecretNotFound } from 'src/control/errors/SecretNotFound';
import type { DataProviderTestDto } from '../validation/dataProvider/parseTestDto';
import { applyAuth } from './applyAuth';
import { resolveAuth } from './resolveAuth';

const TIMEOUT_MS = 10_000;

export type TestConnectionResult =
    | { ok: true;  endpointCount: number | null }
    | { ok: false; error: string };

/**
 * Fetch the OpenAPI URL with the supplied auth and report back to the
 * admin UI. On a 2xx + parseable JSON spec, returns the path count. On
 * any other outcome, returns an error string suitable for inline display.
 *
 * Resolves `${KEY}` references in the auth payload via `secrets` before
 * the fetch — same behaviour as `syncDataProvider`, so a successful
 * test reflects what a real sync would do.
 */
export async function testConnection(
    dto:     DataProviderTestDto,
    secrets: SecretStore,
): Promise<TestConnectionResult> {
    let auth;
    try {
        auth = await resolveAuth(dto.specAuth, secrets);
    } catch (e) {
        if (e instanceof SecretNotFound) {
            return { ok: false, error: `Missing secret: ${e.key}` };
        }
        throw e;
    }

    const headers = new Headers({ Accept: 'application/json,application/yaml' });
    applyAuth(auth, headers);

    try {
        const res = await fetch(dto.sourceUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
            return { ok: false, error: `HTTP ${res.status} ${res.statusText}`.trim() };
        }
        const text = await res.text();
        return { ok: true, endpointCount: countEndpoints(text) };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

function countEndpoints(text: string): number | null {
    try {
        const json = JSON.parse(text);
        if (json && typeof json === 'object' && json.paths && typeof json.paths === 'object') {
            return Object.keys(json.paths).length;
        }
    } catch { /* not JSON or not OpenAPI — caller still knows the URL responded */ }
    return null;
}
