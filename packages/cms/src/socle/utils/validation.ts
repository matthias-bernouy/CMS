/**
 * Pure validation helpers shared by server and client.
 *
 * This module has no runtime dependencies and is safe to import from anywhere
 * in the codebase — admin API endpoints enforce these rules on write, and the
 * corresponding UI panels call the same functions for instant feedback. Keeping
 * them here removes the client/server drift risk (e.g. tightening the regex
 * server-side would otherwise leave the UI silently accepting values the API
 * then rejects).
 */

/**
 * Format check for user page paths. Must start with `/`. Each segment is
 * restricted to `[a-zA-Z0-9-]` so paths stay URL-safe without encoding and
 * can never collide with framework-reserved extensions like `/robots.txt`.
 * No consecutive slashes, no trailing slash (except the root `/` itself).
 */
export function isValidPathFormat(path: string): boolean {
    if (!path || typeof path !== "string") return false;
    if (path === "/") return true;
    return /^(?:\/[a-zA-Z0-9-]+)+$/.test(path);
}

/**
 * Kebab-case check for snippet identifiers: lowercase letters, digits, and
 * single dashes. At least one character, no leading or trailing dash, no
 * consecutive dashes.
 */
export function isValidSnippetIdentifier(id: string): boolean {
    if (!id || typeof id !== "string") return false;
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

/**
 * HTML custom-element name — the subset we accept for bloc tags. Must start
 * with a lowercase letter, contain at least one dash, and be composed of
 * lowercase alphanumerics and dashes after that. Locked to a conservative
 * subset so the tag can also be used safely as a filesystem path by
 * `prepare_bloc`.
 */
export function isValidCustomElementTag(tag: string): boolean {
    if (!tag || typeof tag !== "string") return false;
    return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(tag);
}
