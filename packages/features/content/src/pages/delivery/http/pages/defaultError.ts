import { createHttpErrorPages, staticErrorResponse, selectErrorLanguage } from "@bernouy/http-runner/html";
export const DEFAULT_ERROR_PAGES = createHttpErrorPages();
const PAGES = { en: DEFAULT_ERROR_PAGES, fr: createHttpErrorPages("fr") };
export function defaultErrorResponse(
    request: Pick<Request, "method"> & Partial<Pick<Request, "headers">>,
    status: number,
    fallbackText: string,
    retryAfter?: string,
    language?: string,
) {
    const selected = selectErrorLanguage(request.headers?.get("accept-language"), language);
    if (status === 404 || status === 410 || status === 500 || status === 503) {
        return staticErrorResponse(request, status, PAGES[selected], retryAfter, selected);
    }
    return new Response(request.method === "HEAD" ? null : fallbackText, {
        status,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
}
