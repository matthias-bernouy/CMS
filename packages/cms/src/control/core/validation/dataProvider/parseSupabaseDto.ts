import InvalidParam from 'src/control/errors/Http/InvalidParam';
import MissingParam from 'src/control/errors/Http/MissingParam';
import { assertValidDataProviderId } from './id';

export type SupabaseProviderDto = {
    id:         string;
    projectUrl: string;
    anonKey:    string;
};

// Supabase ships two key formats, both valid as `apikey` header:
//   - new (2026+) publishable: opaque token `sb_publishable_<base62>`, ~50 chars
//   - legacy: JWT (`eyJhbGc...`), ~200+ chars
// We don't pin to either — self-hosted GoTrue setups may use neither shape.
const MIN_KEY_LENGTH = 30;

/**
 * Validate the `+ Add Supabase` form. Lenient by design — we don't pin
 * to `*.supabase.co` (self-hosted GoTrue stays usable) and we accept
 * both publishable and legacy JWT key formats. The length check is
 * just a typo guard; the real validation happens at first call when
 * GoTrue rejects an invalid key.
 */
export function parseSupabaseDto(body: Record<string, unknown>): SupabaseProviderDto {
    const { id, projectUrl, anonKey } = body;
    if (!id)         throw new MissingParam('id');
    if (!projectUrl) throw new MissingParam('projectUrl');
    if (!anonKey)    throw new MissingParam('anonKey');

    assertValidDataProviderId(id);

    if (typeof projectUrl !== 'string') throw new InvalidParam('projectUrl', 'Must be a string.');
    let url: URL;
    try { url = new URL(projectUrl); }
    catch { throw new InvalidParam('projectUrl', 'Must be a valid URL.'); }
    if (url.protocol !== 'https:') {
        throw new InvalidParam('projectUrl', 'Must use https://.');
    }

    if (typeof anonKey !== 'string') throw new InvalidParam('anonKey', 'Must be a string.');
    if (anonKey.length < MIN_KEY_LENGTH) {
        throw new InvalidParam('anonKey', 'Key looks too short — expected `sb_publishable_…` or a legacy JWT.');
    }
    if (anonKey.startsWith('sb_secret_')) {
        throw new InvalidParam('anonKey', 'This is a SECRET key — never expose it to the browser. Use the publishable (anon) key instead.');
    }

    // Strip trailing slash for predictable concatenation with `/auth/v1`.
    const normalisedProjectUrl = url.toString().replace(/\/+$/, '');
    return { id, projectUrl: normalisedProjectUrl, anonKey };
}
