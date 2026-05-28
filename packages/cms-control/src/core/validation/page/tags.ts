import InvalidParam from 'src/control/errors/Http/InvalidParam';

const MAX_TAG_LENGTH = 50;
const MAX_TAGS       = 50;
const TAG_REGEX      = /^[a-zA-Z0-9 _-]+$/;

/**
 * Parse the `tags` field. Accepts:
 *  - `"a,b,c"` (comma-separated string from form/UI)
 *  - `["a", "b"]` (array, e.g. richer JSON client)
 *  - any falsy value → `[]`
 * Each tag is trimmed, validated against `TAG_REGEX`, deduped. Throws
 * `InvalidParam` on malformed input or limit overflow.
 */
export function parsePageTags(raw: unknown): string[] {
    if (!raw) return [];
    const parts = Array.isArray(raw)
        ? raw.map(v => String(v))
        : typeof raw === 'string' ? raw.split(',') : [];

    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of parts) {
        const tag = part.trim();
        if (!tag) continue;
        if (tag.length > MAX_TAG_LENGTH) throw new InvalidParam('tags', `"${tag}" exceeds ${MAX_TAG_LENGTH} chars.`);
        if (!TAG_REGEX.test(tag))        throw new InvalidParam('tags', `"${tag}" has invalid chars.`);
        if (seen.has(tag)) continue;
        seen.add(tag);
        out.push(tag);
        if (out.length > MAX_TAGS) throw new InvalidParam('tags', `Too many tags (max ${MAX_TAGS}).`);
    }
    return out;
}
