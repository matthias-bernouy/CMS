import type { ErrorPageLanguage } from "./language";
import type { HttpErrorStatus } from "./errorDocument";
/** Static documents keep the original failure status, even for conditional and HEAD requests. */
export function staticErrorResponse(
    request: Pick<Request, "method">,
    status: HttpErrorStatus | 410,
    pages: Readonly<Record<HttpErrorStatus, string>>,
    retryAfter?: string,
    language: ErrorPageLanguage = "en",
): Response {
    return new Response(request.method === "HEAD" ? null : pages[status === 410 ? 404 : status], {
        status,
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "vary": "Accept-Language",
            "content-language": language,
            "x-content-type-options": "nosniff",
            "x-robots-tag": "noindex, nofollow",
            "content-security-policy":
                "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            ...((retryAfter ?? (status === 503 ? "60" : undefined)) ? { "retry-after": retryAfter ?? "60" } : {}),
        },
    });
}
