import { actorCredentialFromRequest } from "@bernouy/cms-gateway/protocol";
import type { SharedPolicy } from "./types";

export function sharedPolicy(value: string | null, pages: boolean): SharedPolicy | null {
    if (!value || value.length > 256) {
        return null;
    }
    const flags = new Map<string, string | undefined>();
    for (const token of value.toLowerCase().split(",")) {
        const match = token.trim().match(/^([a-z-]+)(?:=(0|[1-9][0-9]{0,7}))?$/);
        if (
            !match ||
            ![
                "public",
                "private",
                "no-store",
                "no-cache",
                "must-revalidate",
                "immutable",
                "max-age",
                "s-maxage",
                "stale-while-revalidate",
                "stale-if-error",
            ].includes(match[1]!) ||
            flags.has(match[1]!) ||
            ["max-age", "s-maxage", "stale-while-revalidate", "stale-if-error"].includes(match[1]!) !==
                (match[2] !== undefined)
        ) {
            return null;
        }
        flags.set(match[1]!, match[2]);
    }
    if (!flags.has("public") || flags.has("private") || flags.has("no-store")) {
        return null;
    }
    const immutable = flags.has("immutable");
    const seconds = (key: string) => Number(flags.get(key) ?? 0);
    const fresh = flags.has("s-maxage") ? seconds("s-maxage") : flags.has("no-cache") ? 0 : seconds("max-age");
    if (["max-age", "s-maxage", "stale-while-revalidate", "stale-if-error"].some((key) => seconds(key) > 31_536_000)) {
        return null;
    }
    if (!fresh || fresh > 31_536_000 || (!pages && !immutable)) {
        return null;
    }
    return {
        fresh,
        immutable,
        staleWhileRevalidate: seconds("stale-while-revalidate"),
        staleIfError: seconds("stale-if-error"),
    };
}
export function cacheKey(request: Request): string | null {
    if (
        !["GET", "HEAD"].includes(request.method) ||
        request.headers.has("authorization") ||
        request.headers.has("range") ||
        request.headers.has("if-range") ||
        /(?:^|,)\s*(?:no-cache|no-store|max-age=0)(?:\s*(?:,|$))/iu.test(request.headers.get("cache-control") ?? "") ||
        request.headers.get("pragma")?.toLowerCase() === "no-cache"
    ) {
        return null;
    }
    try {
        if (actorCredentialFromRequest(request)) {
            return null;
        }
    } catch {
        // Invalid session credentials still bypass; unrelated browser cookies never reach the Provider.
        return null;
    }
    const url = new URL(request.url);
    const key = JSON.stringify([
        url.pathname,
        [...url.searchParams],
        request.headers.get("accept"),
        request.headers.get("accept-language")?.trim().toLowerCase() ?? null,
    ]);
    return key.length <= 16_384 ? key : null;
}
export function unconditional(request: Request): Request {
    const headers = new Headers(request.headers);
    const language = headers.get("accept-language");
    if (language !== null) {
        headers.set("accept-language", language.trim().toLowerCase());
    }
    headers.delete("if-none-match");
    headers.delete("accept-encoding");
    return new Request(request.url, { method: "GET", headers, signal: request.signal });
}
