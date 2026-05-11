import type { ControlCms } from 'src/control/ControlCms';
import InvalidParam from 'src/control/errors/Http/InvalidParam';
import type { SupabaseProviderDto } from 'src/control/core/validation/dataProvider/parseSupabaseDto';
import { publishProxy } from '../../publishProxy';
import { buildSupabaseOpenApi } from './openapi';
import { buildSupabaseRules, SUPABASE_SECRET_ENV } from './rulesTemplate';

/**
 * Create a `source: 'official'` Supabase data provider in one shot.
 *
 *  - Bundles the GoTrue OpenAPI spec (no network round-trip needed).
 *  - Pre-fills `rules` with the canonical email/password flow.
 *  - Stores the anon key as `secrets.SUPABASE_ANON_KEY` (cleartext on the
 *    wire to cdn-buckets, encrypted at rest via the bucket DEK).
 *  - Persists the provider with `server` + `spec` already populated, so the
 *    Sync round-trip is unnecessary before the proxy can publish.
 *  - Pushes to the proxy publisher immediately. Failure here surfaces to
 *    the caller — the provider row is already in DB regardless.
 */
export async function createSupabaseProvider(cms: ControlCms, dto: SupabaseProviderDto): Promise<void> {
    const existing = await cms.repository.getDataProvider(dto.id);
    if (existing) {
        throw new InvalidParam('id', `"${dto.id}" is already used by another provider.`);
    }

    await cms.repository.createDataProvider({
        id:        dto.id,
        source:    'official',
        sourceUrl: dto.projectUrl,
        server:    `${dto.projectUrl}/auth/v1`,
        spec:      buildSupabaseOpenApi(dto.projectUrl),
        specAuth:  { type: 'none' },
        rules:     buildSupabaseRules(),
        secrets:   { [SUPABASE_SECRET_ENV]: dto.anonKey },
    });

    await publishProxy(cms, dto.id);
}
