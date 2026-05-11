import type { StorageProvider } from "../exports/StorageProvider";
import { consumeToken } from "../core/upload/token/consumeToken";
import { uploadFile } from "../core/upload/uploadFile";
import { originAllowed, corsHeaders } from "../core/upload/cors";

/**
 * Frontier C — direct browser→provider upload. The body is the raw bytes;
 * file metadata (name, parent, publicPath, contentType) is locked at mint
 * time on the broker side, not trusted from the request.
 *
 * CORS-aware (cross-origin browsers use the broker pattern), so we do NOT
 * route through `wrapAdmin` — we need full control over response headers
 * to attach `Access-Control-Allow-Origin` next to the JSON envelope.
 */
export default async function handleUploadPost(req: Request, provider: StorageProvider): Promise<Response> {
    const origin = req.headers.get("origin");
    try {
        const tokenId = new URL(req.url).searchParams.get("token");
        if (!tokenId) throw new TypeError("Missing 'token' query param.");

        const token = await consumeToken(provider, tokenId);

        if (!originAllowed(origin, token.allowedOrigins)) {
            // Token already consumed (single-use semantics) — but we refuse
            // the upload because the browser origin isn't in the allowlist.
            return jsonError(403, "forbidden", `origin "${origin}" not in bucket allowlist.`, origin, token.allowedOrigins);
        }

        const contentLength = parseInt(req.headers.get("content-length") ?? "", 10);
        if (!Number.isFinite(contentLength) || contentLength < 0) {
            return jsonError(400, "validation_error", "Missing or invalid Content-Length header.", origin, token.allowedOrigins);
        }
        if (contentLength > token.maxSize) {
            return jsonError(400, "validation_error", `file_too_large: ${contentLength} > ${token.maxSize}.`, origin, token.allowedOrigins);
        }

        const mimeType = token.contentType
            ?? req.headers.get("content-type")
            ?? "application/octet-stream";

        // contentLength=0 is legal (empty CSS, empty JS bundles). Synthesize
        // an empty stream rather than rejecting; downstream `uploadFile` can
        // chase a `ReadableStream<Uint8Array>` and writes 0 bytes cleanly.
        const body = req.body ?? new Blob([]).stream();

        const stored = await uploadFile(provider, token.bucketId, {
            name:           token.name,
            mimeType,
            body,
            parentFolderID: token.parentFolderID,
            maxSize:        token.maxSize,
            ...(token.publicPath !== undefined ? { publicPath: token.publicPath } : {}),
            ...(token.overwrite               ? { overwrite:    true              } : {}),
        });

        return Response.json({ ok: true, data: stored }, {
            status: 200,
            headers: corsHeaders(origin, token.allowedOrigins),
        });
    } catch (err) {
        console.error("[upload.post] error during upload:", err);
        const message = err instanceof Error ? err.message : String(err);
        const code = err instanceof TypeError ? "validation_error" : "unknown";
        const status = code === "validation_error" ? 400 : 500;
        // No allowlist context available on this path → emit no CORS, the
        // browser will surface a CORS-blocked error which is fine for a
        // broken-token / malformed-request shape.
        return jsonError(status, code, message, origin, undefined);
    }
}

function jsonError(
    status: number,
    code: string,
    message: string,
    origin: string | null,
    allowed: string[] | undefined,
): Response {
    return Response.json({ ok: false, error: { code, message } }, {
        status,
        headers: corsHeaders(origin, allowed),
    });
}
