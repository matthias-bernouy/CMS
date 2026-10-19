const BEARER_SECRET = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
const SECRET_ASSIGNMENT = /\b(password|secret|token|api[-_]?key|authorization|cookie)\s*[:=]\s*([^\s,;&]+)/giu;
const JSON_SECRET =
    /("(?:authorization|cookie|credential|password|secret|session|token|api[-_]?key|private[-_]?key)"\s*:\s*)("(?:\\.|[^"\\])*"|[^,}\]]+)/giu;
const URL_CANDIDATE = /\bhttps?:\/\/[^\s<>"']+/giu;

export function redactDiagnosticString(value: string, maximum: number): string {
    const bounded = value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 1))}…`;
    return bounded
        .replace(BEARER_SECRET, "Bearer [REDACTED]")
        .replace(SECRET_ASSIGNMENT, (_match, key: string) => `${key}=[REDACTED]`)
        .replace(JSON_SECRET, (_match, prefix: string) => `${prefix}"[REDACTED]"`)
        .replace(URL_CANDIDATE, sanitizeUrl);
}

function sanitizeUrl(candidate: string): string {
    try {
        const url = new URL(candidate);
        if (!url.username && !url.password && !url.search && !url.hash) {
            return candidate;
        }
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch {
        return candidate;
    }
}
