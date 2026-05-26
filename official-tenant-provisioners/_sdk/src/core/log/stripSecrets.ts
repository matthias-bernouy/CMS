const DENY = /(authorization|bearer|token|jwt|secret|password|api[-_ ]?key|(^|_)key$)/i;
const JWT_LIKE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const REDACTED = "[redacted]";

/**
 * base.md §10.2 — the Recorder NEVER persists tokens / Authorization / keys /
 * secrets. Strips deny-listed keys and JWT-looking string values from `ctx`,
 * recursively (bounded depth).
 */
export function stripSecrets(v: unknown, depth = 0): unknown {
    if (depth > 4) return REDACTED;
    if (typeof v === "string") return JWT_LIKE.test(v) ? REDACTED : v;
    if (Array.isArray(v)) return v.map((x) => stripSecrets(x, depth + 1));
    if (v && typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            out[k] = DENY.test(k) ? REDACTED : stripSecrets(val, depth + 1);
        }
        return out;
    }
    return v;
}
