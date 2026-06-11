import type { CmsFilesMetadataRepository, FileItem } from "cms-files/interfaces/CmsFilesMetadataRepository";
import type { CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";
import { publicAssetCacheControl } from "@bernouy/http-runner";
import { CMS_FILES_BY_ID_SEGMENT } from "cms-files/core/fileUrls";

/**
 * Cache policy for an id-addressed response. In prod the bytes at a given id are
 * stable (replacing a file's content goes through a NEW id), so the id URL caches
 * forever. In dev (`MODE=DEV`) nothing is cached — you edit files on disk and the
 * same id keeps serving the latest bytes, so it must always revalidate (matches
 * `publicAssetCacheControl`'s dev posture).
 */
const idCacheControl = (): string =>
    process.env.MODE === "DEV" ? "no-cache, must-revalidate" : "public, max-age=31536000, immutable";

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
 * Serve a file's bytes. Shared by Control (`<basePath>/.cms/files/*`,
 * admin-guarded) and Delivery (public). `opts.prefix` is the absolute mount
 * prefix to strip (`${basePath}/.cms/files/`). Two address forms share this one
 * handler (no route-precedence dependency):
 *
 * - **`by-id/<id>`** — opaque id (the stored form). Resolved via `getItem(id)`.
 *   Served under `idCacheControl` (immutable in prod, revalidate in dev — see
 *   that helper for the rationale).
 * - **`<tree-path>`** (`logos/hero.png`) — the human/admin label. Resolved via
 *   the metadata tree and served under the house cache policy
 *   (`publicAssetCacheControl`, = revalidate for media).
 *
 * Path lookups only ever match existing `(parentId, name)` children, so path
 * traversal is structurally impossible; we still decode and reject `.`/`..` and
 * embedded separators defensively. The id form takes no path, so it can't traverse.
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
    if (segments.length === 0) return notFound();

    // ── id route: /.cms/files/by-id/<id> — opaque + immutable (prod) ──
    if (segments[0] === CMS_FILES_BY_ID_SEGMENT) {
        const id = segments[1];
        if (segments.length !== 2 || !id) return notFound();
        const item = await deps.metadata.getItem(id);
        if (!item || item.type !== "file") return notFound(); // unknown id, or a folder id
        const stream = await deps.blob.get(item.id);
        if (!stream) return notFound();
        return fileResponse(item, stream, idCacheControl());
    }

    // ── path route: /.cms/files/<tree-path> — house cache policy ──
    if (segments.some((s) => s === "." || s === ".." || s.includes("/") || s.includes("\\"))) {
        return notFound();
    }
    const item = await deps.metadata.getItemByPath(segments.join("/"));
    if (!item || item.type !== "file") return notFound();
    const stream = await deps.blob.get(item.id);
    if (!stream) return notFound();
    return fileResponse(item, stream, publicAssetCacheControl(req));
}

/** Build the byte response: inline allow-list gating + the security headers,
 *  with the caller's cache policy. Shared by the id and path routes. */
function fileResponse(item: FileItem, stream: ReadableStream<Uint8Array>, cacheControl: string): Response {
    const inlineSafe = INLINE_SAFE_TYPES.has(item.mimeType);
    return new Response(stream, {
        headers: {
            "Content-Type":           inlineSafe ? item.mimeType : "application/octet-stream",
            "Content-Length":         String(item.size),
            // Never let the browser sniff a type we didn't declare, and force a
            // download for anything off the inline allow-list (HTML/SVG/…).
            "Content-Disposition":    inlineSafe ? "inline" : "attachment",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control":          cacheControl,
        },
    });
}
