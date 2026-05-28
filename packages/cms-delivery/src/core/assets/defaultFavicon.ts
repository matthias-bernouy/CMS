import type { CacheEntry } from "src/socle/interfaces/Cache";
import { compress } from "src/socle/server/compression";

/**
 * Inline SVG used as the default favicon when `site.favicon` is empty.
 * Lives in `core/` (not `endpoints/`) so both the runtime endpoint and
 * the build pipeline can reach it without crossing layer boundaries.
 */
export const DEFAULT_FAVICON_SVG =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="12" fill="#4361ee"/>` +
    `<rect x="12" y="14" width="40" height="8" rx="2" fill="#ffffff" opacity="0.95"/>` +
    `<rect x="12" y="28" width="24" height="8" rx="2" fill="#ffffff" opacity="0.80"/>` +
    `<rect x="12" y="42" width="32" height="8" rx="2" fill="#ffffff" opacity="0.90"/>` +
    `</svg>`;

export function generateFaviconEntry(): CacheEntry {
    return compress(DEFAULT_FAVICON_SVG, "image/svg+xml");
}
