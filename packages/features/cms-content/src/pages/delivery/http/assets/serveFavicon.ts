import { sendCompressed } from "@bernouy/http-runner";
import { generateFaviconEntry } from "cms-content/pages/delivery/http/assets/favicon";

const FAVICON_CACHE_CONTROL = "no-cache, must-revalidate";

/**
 * Stable default favicon used when Page settings do not provide one.
 */
export default function serveFavicon(req: Request): Response {
    const resolved = sendCompressed(req, generateFaviconEntry(), FAVICON_CACHE_CONTROL);
    return req.method === "HEAD" ? withoutBody(resolved) : resolved;
}

function withoutBody(response: Response): Response {
    return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}
