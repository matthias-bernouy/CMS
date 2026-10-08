import type DeliveryCms from "cms-delivery/DeliveryCms";
import { sendCompressed } from "@bernouy/http-runner";
import { generateFaviconEntry } from "cms-delivery/core/assets/defaultFavicon";

const FAVICON_CACHE_CONTROL = "no-cache, must-revalidate";

/**
 * Stable Delivery favicon. A configured CMS file is resolved server-side so
 * its opaque storage id never leaks into rendered page metadata. The default
 * SVG remains available when settings or file storage cannot resolve it.
 */
export default function FaviconServer(req: Request, _delivery: DeliveryCms): Response {
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
