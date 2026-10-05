const DEFAULT_REQUEST_BODY_LIMIT = 1024 * 1024;

export class RequestBodyTooLargeError extends Error {
    readonly status = 413;
    readonly publicCode = "request_body_too_large";

    constructor(readonly maximumBytes: number) {
        super(`Request body exceeds the ${maximumBytes}-byte limit`);
        this.name = "RequestBodyTooLargeError";
    }
}

/** Read a request body without trusting Content-Length and stop allocation at the configured limit. */
export async function readBoundedRequestBody(
    request: Request,
    maximumBytes = DEFAULT_REQUEST_BODY_LIMIT,
): Promise<Uint8Array> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
        throw new TypeError("maximumBytes must be a non-negative safe integer");
    }
    const declared = request.headers.get("content-length");
    if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximumBytes)) {
        throw new RequestBodyTooLargeError(maximumBytes);
    }
    if (!request.body) {
        return new Uint8Array();
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            size += part.value.byteLength;
            if (size > maximumBytes) {
                await reader.cancel();
                throw new RequestBodyTooLargeError(maximumBytes);
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

export async function readBoundedFormData(request: Request, maximumBytes: number): Promise<FormData> {
    const bytes = await readBoundedRequestBody(request, maximumBytes);
    const contentType = request.headers.get("content-type");
    const headers = contentType ? { "Content-Type": contentType } : undefined;
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Request(request.url, { method: "POST", headers, body }).formData();
}
