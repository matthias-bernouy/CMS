import { createHttpErrorPages, staticErrorResponse, selectErrorLanguage } from "@bernouy/http-runner/html";
import { isEdgeReservedPath } from "./reservedPaths";
const PAGES = { en: createHttpErrorPages(), fr: createHttpErrorPages("fr") };
/** Public failures have an offline document; technical protocols retain their bodyless refusal. */
export function publicErrorResponse(request: Request, status: 404 | 503) {
    const language = selectErrorLanguage(request.headers.get("accept-language"));
    if (["GET", "HEAD"].includes(request.method) && !isEdgeReservedPath(new URL(request.url).pathname)) {
        return staticErrorResponse(request, status, PAGES[language], undefined, language);
    }
    return new Response(null, { status, headers: { "cache-control": "no-store" } });
}
