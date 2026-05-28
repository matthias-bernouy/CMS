import type DeliveryCms from "src/delivery/DeliveryCms";
import { sendCompressed } from "src/socle/server/compression";
import { generateFaviconEntry } from "src/delivery/core/assets/defaultFavicon";

/**
 * Default Delivery favicon served at `<cmsPathPrefix>/assets/favicon`.
 * Used by `renderPage` when `settings.site.favicon` is empty. The SVG bytes
 * live in `core/assets/defaultFavicon.ts` so the build pipeline can upload
 * the same asset to the CDN without duplicating the source.
 */
export default async function FaviconServer(req: Request, _delivery: DeliveryCms) {
    return sendCompressed(req, generateFaviconEntry());
}
