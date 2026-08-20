import type DeliveryCms from "cms-delivery/DeliveryCms";
import { isInlineSafeFileType, mediaIdFromUrl } from "@bernouy/cms-files";
import { securityHeaders, sendCompressed } from "@bernouy/http-runner";
import { generateFaviconEntry } from "cms-delivery/core/assets/defaultFavicon";

const FAVICON_CACHE_CONTROL = "no-cache, must-revalidate";

/**
 * Stable Delivery favicon. A configured CMS file is resolved server-side so
 * its opaque storage id never leaks into rendered page metadata. The default
 * SVG remains available when settings or file storage cannot resolve it.
 */
export default async function FaviconServer(req: Request, delivery: DeliveryCms): Promise<Response> {
    let response: Response | null = null;
    try {
        response = await configuredFavicon(req, delivery);
    } catch (error) {
        console.error("Delivery favicon fallback", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
    }

    const resolved = response ?? sendCompressed(req, generateFaviconEntry(), FAVICON_CACHE_CONTROL);
    return req.method === "HEAD" ? withoutBody(resolved) : resolved;
}

async function configuredFavicon(req: Request, delivery: DeliveryCms): Promise<Response | null> {
    const settings = await delivery.repository.getSystem();
    const fileId = mediaIdFromUrl(settings.site?.favicon?.trim() ?? "");
    const metadata = delivery.filesMetadataOrNull;
    const blob = delivery.filesBlobOrNull;
    if (!fileId || !metadata || !blob) {
        return null;
    }

    const item = await metadata.getItem(fileId);
    if (!item || item.type !== "file" || !item.mimeType.startsWith("image/") || !isInlineSafeFileType(item.mimeType)) {
        return null;
    }
    const stream = await blob.get(item.id);
    if (!stream) {
        return null;
    }

    const etag = item.contentHash ? `"${item.contentHash}"` : null;
    const headers = new Headers({
        ...securityHeaders(),
        "Cache-Control": FAVICON_CACHE_CONTROL,
        "Content-Disposition": "inline",
        "Content-Length": String(item.size),
        "Content-Type": item.mimeType,
    });
    if (etag) {
        headers.set("ETag", etag);
        if (req.headers.get("if-none-match") === etag) {
            headers.delete("Content-Length");
            return new Response(null, { status: 304, headers });
        }
    }
    return new Response(stream, { headers });
}

function withoutBody(response: Response): Response {
    return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}
