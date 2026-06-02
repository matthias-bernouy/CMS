import type { CmsFilesMetadataRepository } from "cms-shared/interfaces/CmsFilesMetadataRepository";
import type { CmsFilesBlobStore } from "cms-shared/interfaces/CmsFilesBlobStore";

/**
 * MIME types we are willing to serve inline. `item.mimeType` derives from the
 * uploading browser's `file.type` and is therefore attacker-controlled, so an
 * HTML or SVG file served inline would execute script on the serving origin.
 * Anything outside this allow-list is sent as an opaque download.
 */
const INLINE_SAFE_TYPES = new Set([
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp",
    "video/mp4", "video/webm", "video/ogg",
    "audio/mpeg", "audio/ogg", "audio/wav",
    "application/pdf",
]);

export type FilesServeDeps = {
    metadata: CmsFilesMetadataRepository;
    blob:     CmsFilesBlobStore;
};

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Serve a file's bytes addressed by its readable tree-path. Shared by Control
 * (`<basePath>/.cms/files/*`, admin-guarded) and Delivery (public): both mount a
 * `runner.group("/.cms/files", …)` whose default GET delegates here. `opts.prefix`
 * is the absolute mount prefix to strip (`${basePath}/.cms/files/`); the remainder
 * is the readable path (`logos/hero.png`), resolved to a file via the metadata
 * tree, then streamed from the blob store keyed by that file's id.
 *
 * The lookup only ever matches existing `(parentId, name)` children, so path
 * traversal is structurally impossible; we still decode and reject `.`/`..` and
 * embedded separators defensively before resolving.
 */
export async function serveFilesRequest(
    deps: FilesServeDeps,
    req: Request,
    opts: { prefix: string },
): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith(opts.prefix)) return notFound();

    let segments: string[];
    try {
        segments = pathname.slice(opts.prefix.length).split("/").map(decodeURIComponent);
    } catch {
        return notFound(); // malformed percent-encoding
    }
    segments = segments.map((s) => s.trim()).filter(Boolean);
    if (
        segments.length === 0 ||
        segments.some((s) => s === "." || s === ".." || s.includes("/") || s.includes("\\"))
    ) {
        return notFound();
    }

    const item = await deps.metadata.getItemByPath(segments.join("/"));
    if (!item || item.type !== "file") return notFound();

    const stream = await deps.blob.get(item.id);
    if (!stream) return notFound();

    const inlineSafe = INLINE_SAFE_TYPES.has(item.mimeType);
    return new Response(stream, {
        headers: {
            "Content-Type":           inlineSafe ? item.mimeType : "application/octet-stream",
            "Content-Length":         String(item.size),
            // Never let the browser sniff a type we didn't declare, and force a
            // download for anything off the inline allow-list (HTML/SVG/…).
            "Content-Disposition":    inlineSafe ? "inline" : "attachment",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
