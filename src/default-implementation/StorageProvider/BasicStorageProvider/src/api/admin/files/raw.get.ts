import type { StorageProvider } from "../../../exports/StorageProvider";

/**
 * Admin-only preview endpoint that streams a file's bytes through the app
 * server (bypasses Nginx). Useful for local dev where the public CDN host
 * isn't reachable, and for the admin UI to preview private content without
 * relying on the public URL. Auth is handled by the `/admin/*` guard at the
 * group level — no `wrapAdmin` here because we return raw bytes, not JSON.
 */
export default async function rawFile(req: Request, provider: StorageProvider): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return new Response("Missing 'id' query param.", { status: 400 });

    const file = await provider.storedFileRepo.get(id);
    if (!file) return new Response("File not found.", { status: 404 });

    const stream = await provider.blobStorage.read(file.bucketId, file.storagePath);
    if (!stream) return new Response("File missing on disk.", { status: 404 });

    return new Response(stream, {
        headers: {
            "Content-Type":   file.mimeType,
            "Content-Length": String(file.size),
            // Inline so the browser displays it where possible (image preview, PDF viewer).
            "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
        },
    });
}
