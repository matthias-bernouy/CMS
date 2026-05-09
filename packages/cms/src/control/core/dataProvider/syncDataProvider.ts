import type { ControlCms } from 'src/control/ControlCms';
import { SecretNotFound } from 'src/control/errors/SecretNotFound';
import { countOpenApiEndpoints } from 'src/socle/utils/openapi';
import { parseSpec } from 'src/control/core/data/parseSpec';
import { SpecParseError } from 'src/control/errors/SpecParseError';
import { applyAuth } from './applyAuth';
import { resolveAuth } from './resolveAuth';
import { publishProxy } from './publishProxy';

const TIMEOUT_MS = 30_000;

export type SyncResult =
    | { ok: true;  endpointCount: number }
    | { ok: false; error: string };

/**
 * Fetch the OpenAPI spec at the provider's `sourceUrl` with its stored
 * auth, persist the raw body in `provider.spec`, and bump `lastSyncAt`.
 * The endpoint count is derived from the spec at list-time.
 *
 * Auth `${KEY}` references are resolved via `cms.secrets` immediately
 * before the outbound fetch — literal tokens never reach the wire from
 * the admin UI in this build.
 *
 * `lastSyncAt` is only updated on success; failures leave the record
 * untouched so the admin still sees the last good sync timestamp.
 */
export async function syncDataProvider(cms: ControlCms, id: string): Promise<SyncResult | null> {
    const provider = await cms.repository.getDataProvider(id);
    if (!provider) return null;

    let auth;
    try {
        auth = await resolveAuth(provider.specAuth, cms.secrets);
    } catch (e) {
        if (e instanceof SecretNotFound) {
            return { ok: false, error: `Missing secret: ${e.key}` };
        }
        throw e;
    }

    const headers = new Headers({ Accept: 'application/json,application/yaml' });
    applyAuth(auth, headers);

    let res: Response;
    try {
        res = await fetch(provider.sourceUrl, {
            method:  'GET',
            headers,
            signal:  AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status} ${res.statusText}`.trim() };
    }

    const spec = await res.text();

    // Derive the API base URL from the spec — `servers[0].url` for 3.x,
    // or the `schemes`+`host`+`basePath` triplet (translated by
    // `swagger2to3`) for 2.0. We never guess: an empty value means the
    // spec carries no server info and the admin will need to fill it in
    // through the Data tab UI before the runtime fetch can work.
    const server = deriveServerFrom(spec);

    await cms.repository.updateDataProvider(id, {
        spec,
        server,
        lastSyncAt: new Date(),
    });
    cms.specCache.delete(id);

    // Publish to the upstream CDN proxy layer. Server is now populated
    // (post-sync), so the proxy can be activated. Failure here doesn't
    // roll back the sync — the OpenAPI spec is in DB regardless. The
    // operator will see the publish error (if any) propagated up to
    // the admin response.
    await publishProxy(cms, id);

    return { ok: true, endpointCount: countOpenApiEndpoints(spec) };
}

function deriveServerFrom(spec: string): string {
    try { return parseSpec(spec).servers[0]?.url ?? ""; }
    catch (e) {
        if (e instanceof SpecParseError) return "";
        throw e;
    }
}
