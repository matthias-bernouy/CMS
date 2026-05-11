import InvalidParam from 'src/control/errors/Http/InvalidParam';
import MissingParam from 'src/control/errors/Http/MissingParam';
import { assertValidDataProviderId } from './id';

export type SupabaseDataDto = {
    id:          string;
    /** Supabase project ref (subdomain of *.supabase.co). Used to build the
     *  Management API path `/v1/projects/<ref>/database/openapi`. */
    projectRef:  string;
    /** Personal Access Token from supabase.com/dashboard/account/tokens.
     *  Used ONCE at admin-time to fetch the OpenAPI; not forwarded to the
     *  runtime proxy. Stored in `specAuth.token` so resync stays automatic. */
    accessToken: string;
    /** Project publishable key. Used at RUNTIME by the proxy as the `apikey`
     *  header on every PostgREST call. */
    anonKey:     string;
};

const PROJECT_REF_RE = /^[a-z]{20}$/;
const MIN_PAT_LENGTH = 30;
const MIN_KEY_LENGTH = 30;

/**
 * Validate the `+ Add Supabase Data` form. Three independent credentials:
 *   - `projectRef` identifies the Supabase project.
 *   - `accessToken` (PAT) authenticates the admin-time spec fetch on
 *     api.supabase.com/v1/projects/<ref>/database/openapi. We extract the
 *     runtime PostgREST server URL from the spec's `servers[0].url`, so
 *     no separate projectUrl input is needed.
 *   - `anonKey` (publishable) powers runtime requests via the rules engine.
 */
export function parseSupabaseDataDto(body: Record<string, unknown>): SupabaseDataDto {
    const { id, projectRef, accessToken, anonKey } = body;
    if (!id)          throw new MissingParam('id');
    if (!projectRef)  throw new MissingParam('projectRef');
    if (!accessToken) throw new MissingParam('accessToken');
    if (!anonKey)     throw new MissingParam('anonKey');

    assertValidDataProviderId(id);

    if (typeof projectRef !== 'string') throw new InvalidParam('projectRef', 'Must be a string.');
    if (!PROJECT_REF_RE.test(projectRef)) {
        throw new InvalidParam('projectRef',
            'Must be the 20-character project ref (subdomain of *.supabase.co), e.g. `hnsutcetdsetjrubdhjl`.');
    }

    if (typeof accessToken !== 'string') throw new InvalidParam('accessToken', 'Must be a string.');
    if (accessToken.length < MIN_PAT_LENGTH) {
        throw new InvalidParam('accessToken', 'Looks too short — expected a Personal Access Token (sbp_…).');
    }

    if (typeof anonKey !== 'string') throw new InvalidParam('anonKey', 'Must be a string.');
    if (anonKey.length < MIN_KEY_LENGTH) {
        throw new InvalidParam('anonKey', 'Looks too short — expected `sb_publishable_…` or a legacy JWT.');
    }
    if (anonKey.startsWith('sb_secret_')) {
        throw new InvalidParam('anonKey', 'This is a SECRET key — never expose it to the browser. Use the publishable key instead.');
    }

    return { id, projectRef, accessToken, anonKey };
}
