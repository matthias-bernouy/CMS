import { nonNegativeInteger, parseCacheDirectives } from "./cacheControl";

const COVERED_VARY_HEADERS = new Set(["accept", "accept-language"]);
export const MAX_PUBLIC_SOURCE_FRESHNESS_MS = 31_536_000 * 1_000;

export type PublicSourceFreshness = Readonly<{ freshUntil: number }>;

export function publicSourceFreshness(response: Response, now: number): PublicSourceFreshness | null {
    if (response.headers.has("set-cookie") || !varyIsCovered(response.headers.get("vary"))) {
        return null;
    }
    const directives = parseCacheDirectives(response.headers.get("cache-control"));
    if (!directives) {
        return null;
    }
    if (
        directives.get("public") !== true ||
        directives.has("private") ||
        directives.has("no-store") ||
        directives.has("no-cache")
    ) {
        return null;
    }
    const maxAge = numericDirective(directives, "max-age");
    const sharedMaxAge = numericDirective(directives, "s-maxage");
    if (maxAge === undefined || (directives.has("s-maxage") && sharedMaxAge === undefined)) {
        return null;
    }
    const declared = minimumDefined(maxAge, sharedMaxAge);
    const ageHeader = response.headers.get("age");
    const declaredAge = ageHeader === null ? 0 : nonNegativeInteger(ageHeader);
    const apparentAge = responseApparentAgeSeconds(response.headers.get("date"), now);
    if (declaredAge === undefined || apparentAge === undefined) {
        return null;
    }
    const currentAge = Math.max(declaredAge, apparentAge);
    const remaining =
        declared === undefined ? 0 : Math.min(declared - currentAge, MAX_PUBLIC_SOURCE_FRESHNESS_MS / 1_000);
    return remaining > 0 ? { freshUntil: now + remaining * 1000 } : null;
}

export function freshPublicCacheControl(freshUntil: number, now: number): string {
    const remaining = Math.max(0, Math.floor((freshUntil - now) / 1000));
    return `public, max-age=${remaining}, immutable, must-revalidate`;
}

function numericDirective(directives: Map<string, string | true>, name: string): number | undefined {
    const value = directives.get(name);
    return typeof value === "string" ? nonNegativeInteger(value) : undefined;
}

function responseApparentAgeSeconds(value: string | null, now: number): number | undefined {
    if (value === null) {
        return 0;
    }
    const date = Date.parse(value);
    if (!Number.isFinite(date)) {
        return undefined;
    }
    return Math.max(0, Math.ceil((now - date) / 1000));
}

function minimumDefined(left: number | undefined, right: number | undefined): number | undefined {
    if (left === undefined) {
        return right;
    }
    if (right === undefined) {
        return left;
    }
    return Math.min(left, right);
}

function varyIsCovered(value: string | null): boolean {
    if (!value) {
        return true;
    }
    return value
        .split(",")
        .map((header) => header.trim().toLowerCase())
        .every((header) => header !== "*" && COVERED_VARY_HEADERS.has(header));
}
