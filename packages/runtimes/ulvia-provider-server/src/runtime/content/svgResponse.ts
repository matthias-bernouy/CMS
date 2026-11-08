const MAX_INLINE_SVG_BYTES = 64 * 1024;

/** Refusals, failed reads and completed reads all release the borrowed response body. */
export async function readImmutableSvg(response: Response): Promise<Uint8Array> {
    try {
        assertImmutableSvgResponse(response);
        return await readBounded(response);
    } finally {
        if (!response.body?.locked) {
            await response.body?.cancel();
        }
    }
}
function assertImmutableSvgResponse(response: Response): void {
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const etag = response.headers.get("etag");
    const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";
    if (response.status !== 200 || mediaType !== "image/svg+xml") {
        throw new Error(`cms-svg source returned ${response.status} ${mediaType ?? "without a content type"}`);
    }
    if (!etag || etag.startsWith("W/") || !cacheControl.includes("immutable")) {
        throw new Error("cms-svg source must return a strong ETag and immutable cache policy");
    }
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/u.test(length) || Number(length) > MAX_INLINE_SVG_BYTES)) {
        throw new Error("cms-svg source exceeds its byte budget");
    }
}

async function readBounded(response: Response): Promise<Uint8Array> {
    if (!response.body) {
        return new Uint8Array();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            length += value.byteLength;
            if (length > MAX_INLINE_SVG_BYTES) {
                await reader.cancel();
                throw new Error("cms-svg source exceeds its byte budget");
            }
            chunks.push(value);
        }
    } finally {
        try {
            await reader.cancel();
        } finally {
            reader.releaseLock();
        }
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}
