const SAFE_NAVIGATION_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007F]/u;

/** Returns one canonical same-origin URL, or `null` when the input can escape the origin. */
export function normalizeInternalUrl(value: string): string | null {
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || CONTROL_OR_SPACE.test(value)) {
        return null;
    }
    try {
        const url = new URL(value, "https://ulvia.invalid");
        return url.origin === "https://ulvia.invalid" ? `${url.pathname}${url.search}${url.hash}` : null;
    } catch {
        return null;
    }
}

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
