import type { ControlCms } from 'src/control/ControlCms';
import InvalidParam from 'src/control/errors/Http/InvalidParam';
import type { SupabaseDataDto } from 'src/control/core/validation/dataProvider/parseSupabaseDataDto';
import { syncDataProvider } from '../../syncDataProvider';
import { buildSupabaseDataRules, SUPABASE_DATA_SECRET_ENV } from './rulesTemplate';

const MGMT_API_BASE = "https://api.supabase.com";

/**
 * Create a `source: 'official'` Supabase Data provider.
 *
 * Two distinct credentials live in this provider:
 *   - `accessToken` (admin-time only) — Personal Access Token from
 *     supabase.com/dashboard/account/tokens. Used as Bearer to fetch the
 *     OpenAPI from the Management API at `api.supabase.com/v1/projects/
 *     <ref>/database/openapi`. Stored in `specAuth.token` so resync can
 *     re-fetch when the schema changes.
 *   - `anonKey` (runtime) — the project's publishable key. Used by the
 *     edge proxy as `apikey` on every PostgREST call. Stored in
 *     `secrets.SUPABASE_ANON_KEY`.
 *
 * The PAT NEVER reaches the cdn-edge — it's purely admin-time and can
 * be rotated without redeploying the proxy. The runtime path uses
 * the anonKey + the user's JWT cookie (set by the companion auth
 * provider) for RLS-gated row access.
 *
 * `server` is left empty at create time; `syncDataProvider` reads it
 * from the spec's `servers[0].url` (PostgREST puts the right URL there)
 * and updates the row before calling publishProxy.
 */
export async function createSupabaseDataProvider(cms: ControlCms, dto: SupabaseDataDto): Promise<void> {
    const existing = await cms.repository.getDataProvider(dto.id);
    if (existing) {
        throw new InvalidParam('id', `"${dto.id}" is already used by another provider.`);
    }

    const specUrl = `${MGMT_API_BASE}/v1/projects/${dto.projectRef}/database/openapi`;

    await cms.repository.createDataProvider({
        id:        dto.id,
        source:    'official',
        sourceUrl: specUrl,
        server:    '',
        spec:      '',
        specAuth:  { type: 'bearer', token: dto.accessToken },
        rules:     buildSupabaseDataRules(),
        secrets:   { [SUPABASE_DATA_SECRET_ENV]: dto.anonKey },
    });

    // Pull the PostgREST OpenAPI now so the provider arrives ready-to-use.
    // syncDataProvider also calls publishProxy on success.
    const result = await syncDataProvider(cms, dto.id);
    if (result && !result.ok) {
        throw new InvalidParam('accessToken',
            `Provider created but spec fetch failed: ${result.error}. Verify the access token then click "Sync".`);
    }
}
