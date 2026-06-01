/**
 * Shared request-header policy — the SINGLE source of truth for which header
 * names a config (the control-side parser) may store and which the runtime (the
 * executor) may forward. Keeping both on this one denylist/validator removes the
 * 'config ≠ runtime' divergence (a header accepted at save but rejected at proxy).
 *
 * `authorization` is intentionally NOT forbidden: a secret-sourced Authorization
 * is the proper use, and a plaintext static one is the operator's call. (The
 * inbound-forwarding allowlist — a separate concern — still never leaks it.)
 */
export const FORBIDDEN_REQUEST_HEADERS = new Set([
    'host', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'upgrade',
    'proxy-connection', 'proxy-authorization', 'trailer', 'content-length', 'cookie',
]);

/** RFC 7230 token: the legal characters of a header field name. */
export const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export const isForbiddenHeaderName = (n: string): boolean => FORBIDDEN_REQUEST_HEADERS.has(n.toLowerCase());
export const isValidHeaderName = (n: string): boolean => HEADER_NAME_RE.test(n);
