import type { TSystem } from "cms-content/interfaces/settings";
import { ContentValidationError } from "cms-content/core/errors";

/**
 * Validate + normalize a CSP origin allow-list: each entry must be a valid
 * absolute URL with a non-null origin; the value is normalized to its
 * `URL.origin` (default ports + trailing slash stripped) and deduped.
 */
function validateOrigins(field: string, origins: string[]): string[] {
    const out = new Set<string>();
    for (const raw of origins) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        let origin: string;
        try { origin = new URL(trimmed).origin; }
        catch { throw new ContentValidationError(field, `invalid URL: "${trimmed}"`); }
        if (!origin || origin === "null") {
            throw new ContentValidationError(field, `URL has no origin: "${trimmed}"`);
        }
        out.add(origin);
    }
    return [...out];
}

/**
 * Validate + normalize a settings patch's domain-ruled fields (the security
 * CSP extras). Other sections pass through untouched. Returns a new patch with
 * normalized origins; throws `ContentValidationError`.
 */
export function validateSettingsPatch(patch: Partial<TSystem>): Partial<TSystem> {
    if (!patch.security) return patch;
    const security = { ...patch.security };
    if (security.connectExtras !== undefined) security.connectExtras = validateOrigins("connectExtras", security.connectExtras);
    if (security.mediaExtras   !== undefined) security.mediaExtras   = validateOrigins("mediaExtras", security.mediaExtras);
    return { ...patch, security };
}
