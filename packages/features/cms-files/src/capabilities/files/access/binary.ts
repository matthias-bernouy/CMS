import type { CmsFileRead } from "cms-files/interfaces";

/** Keep immutable byte responses streaming, including Range and If-Range metadata. */
export async function binaryResponse(read: CmsFileRead): Promise<Response> {
    try {
        const safe = read.file.name.replace(/[\r\n"\\]/gu, "_");
        return new Response(read.stream, {
            status: read.status,
            headers: {
                "content-type": read.contentType,
                "content-length": String(read.contentLength),
                etag: read.etag,
                "cache-control": read.cacheControl,
                "accept-ranges": "bytes",
                ...(read.contentRange ? { "content-range": read.contentRange } : {}),
                "content-disposition":
                    'inline; filename="' + safe + "\"; filename*=UTF-8''" + encodeURIComponent(read.file.name),
            },
        });
    } catch (error) {
        await read.stream.cancel(error).catch(() => undefined);
        throw error;
    }
}
