const SAFE_NAVIGATION_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

export function isSafeNavigationalUrl(value: string): boolean {
    const scheme = normalizedScheme(value);
    return scheme === null || SAFE_NAVIGATION_SCHEMES.has(scheme);
}

export function isSafeStoredResourceUrl(value: string): boolean {
    const normalized = normalizeForSchemeInspection(value);
    return (
        !normalized.startsWith("javascript:") &&
        !normalized.startsWith("vbscript:") &&
        !normalized.startsWith("data:text/html")
    );
}

function normalizedScheme(value: string): string | null {
    return /^([a-z][a-z0-9+.-]*):/.exec(normalizeForSchemeInspection(value))?.[1] ?? null;
}

function normalizeForSchemeInspection(value: string): string {
    return value.replace(/[\u0000-\u0020]/g, "").toLowerCase();
}
