import { ContentValidationError } from "cms-content/core/errors";
import { hardenStoredHtml } from "cms-content/core/validation/hardenStoredHtml";

/**
 * Field-level validators shared by the content entities. Each one
 * VALIDATES (throws `ContentValidationError` — carries `.status` 400) AND
 * NORMALIZES (trim, harden, dedupe), returning the clean value. The
 * coercion of raw HTTP shapes (`null`→`""`, `"on"`→`true`, `"a,b"`→array)
 * stays in the surface DTO parsers — these receive already-typed values.
 */

const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

/** Required short label (title/name). `max` differs per entity. */
export function validateLabel(field: string, value: string, max: number): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) throw new ContentValidationError(field, "cannot be empty");
    if (trimmed.length > max)  throw new ContentValidationError(field, `too long (${trimmed.length}); max ${max}`);
    if (CONTROL_CHARS.test(trimmed)) throw new ContentValidationError(field, "contains invalid control characters");
    return trimmed;
}

/** Optional free text (description). Empty is allowed. */
export function validateOptionalText(field: string, value: string, max: number): string {
    const trimmed = value.trim();
    if (trimmed.length > max) throw new ContentValidationError(field, `too long; max ${max}`);
    return trimmed;
}

/** Optional category slug. Empty is allowed. */
export function validateCategory(value: string, max = 50): string {
    const trimmed = value.trim();
    if (trimmed.length > max) throw new ContentValidationError("category", `too long; max ${max}`);
    return trimmed;
}

const MAX_CONTENT = 5_000_000;

/** Stored rich-text/HTML content: size-bounded then DOM-hardened (sanitized). */
export function validateContent(value: string): string {
    if (value.length > MAX_CONTENT) throw new ContentValidationError("content", `too long; max ${MAX_CONTENT} chars`);
    return hardenStoredHtml(value);
}

const MAX_TAG_LENGTH = 50;
const MAX_TAGS       = 50;
const TAG_REGEX      = /^[a-zA-Z0-9 _-]+$/;

/** Page tags: per-tag charset + length, total count, trimmed + deduped. */
export function validateTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of tags) {
        const tag = raw.trim();
        if (!tag) continue;
        if (tag.length > MAX_TAG_LENGTH) throw new ContentValidationError("tags", `"${tag}" exceeds ${MAX_TAG_LENGTH} chars`);
        if (!TAG_REGEX.test(tag))        throw new ContentValidationError("tags", `"${tag}" has invalid chars`);
        if (seen.has(tag)) continue;
        seen.add(tag);
        out.push(tag);
        if (out.length > MAX_TAGS) throw new ContentValidationError("tags", `too many tags; max ${MAX_TAGS}`);
    }
    return out;
}

/** Required opaque id (the document primary key on updates). */
export function validateId(value: string): string {
    if (value.length === 0) throw new ContentValidationError("id", "required");
    return value;
}
