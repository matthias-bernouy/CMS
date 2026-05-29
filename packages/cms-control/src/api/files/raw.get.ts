import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";

/**
 * MIME types we are willing to serve inline. `item.mimeType` derives from the
 * uploading browser's `file.type` and is therefore attacker-controlled, so an
 * HTML or SVG file served inline would execute script on the admin origin.
 * Anything outside this allow-list is sent as an opaque download.
 */
const INLINE_SAFE_TYPES = new Set([
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp",
    "video/mp4", "video/webm", "video/ogg",
    "audio/mpeg", "audio/ogg", "audio/wav",
    "application/pdf",
]);

/** GET /api/files/raw?id= — stream a file's bytes (the proxy read). */
export default async function rawFile(req: Request, cms: ControlCms) {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new MissingParam("id");

    const item = await cms.filesMetadata.getItem(id);
    if (!item || item.type !== "file") return new Response("Not found", { status: 404 });

    const stream = await cms.filesBlob.get(id);
    if (!stream) return new Response("Not found", { status: 404 });

    const inlineSafe = INLINE_SAFE_TYPES.has(item.mimeType);
    return new Response(stream, {
        headers: {
            "Content-Type":           inlineSafe ? item.mimeType : "application/octet-stream",
            "Content-Length":         String(item.size),
            // Never let the browser sniff a type we didn't declare, and force a
            // download for anything not on the inline allow-list (HTML/SVG/…).
            "Content-Disposition":    inlineSafe ? "inline" : "attachment",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
