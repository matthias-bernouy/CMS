import { consumeToken } from "../core/upload/token/consumeToken";
import { uploadFile } from "../core/upload/uploadFile";
import { wrapAdmin } from "../core/admin/wrapAdmin";

/**
 * Frontier C — direct browser→provider upload. The body is the raw bytes;
 * file metadata (name, parent, publicPath, contentType) is locked at mint
 * time on the broker side, not trusted from the request.
 */
export default wrapAdmin(async (req, provider) => {
    const tokenId = new URL(req.url).searchParams.get("token");
    if (!tokenId) throw new TypeError("Missing 'token' query param.");

    const token = await consumeToken(provider, tokenId);

    const contentLength = parseInt(req.headers.get("content-length") ?? "", 10);
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
        throw new TypeError("Missing or invalid Content-Length header.");
    }
    if (contentLength > token.maxSize) {
        throw new Error(`file_too_large: ${contentLength} > ${token.maxSize}.`);
    }
    if (!req.body) throw new TypeError("Empty request body.");

    const mimeType = token.contentType
        ?? req.headers.get("content-type")
        ?? "application/octet-stream";

    return uploadFile(provider, token.bucketId, {
        name:           token.name,
        mimeType,
        body:           req.body,
        parentFolderID: token.parentFolderID,
        maxSize:        token.maxSize,
        ...(token.publicPath !== undefined ? { publicPath: token.publicPath } : {}),
    });
});
