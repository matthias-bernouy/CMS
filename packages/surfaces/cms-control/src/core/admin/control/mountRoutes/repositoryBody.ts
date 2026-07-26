const JSON_MEDIA_TYPE = "application/json";

export class RepositoryControlRequestError extends Error {
    constructor(readonly status: 400 | 413) {
        super(status === 413 ? "Repository request body is too large" : "Repository request body is invalid");
        this.name = "RepositoryControlRequestError";
    }
}

export async function readRepositoryControlBody(request: Request, maxBytes: number): Promise<Uint8Array> {
    assertLimit(maxBytes);
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const encoding = request.headers.get("content-encoding")?.trim().toLowerCase();
    if (mediaType !== JSON_MEDIA_TYPE || (encoding && encoding !== "identity")) {
        throw new RepositoryControlRequestError(400);
    }
    const length = contentLength(request.headers.get("content-length"));
    if (length !== undefined && length > maxBytes) {
        throw new RepositoryControlRequestError(413);
    }
    const bytes = await readBounded(request.body, maxBytes);
    if (length !== undefined && length !== bytes.byteLength) {
        throw new RepositoryControlRequestError(400);
    }
    return bytes;
}

export async function readRepositoryControlJson(request: Request, maxBytes: number): Promise<unknown> {
    const bytes = await readRepositoryControlBody(request, maxBytes);
    try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return JSON.parse(text) as unknown;
    } catch {
        throw new RepositoryControlRequestError(400);
    }
}

async function readBounded(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
    if (!stream) {
        throw new RepositoryControlRequestError(400);
    }
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (!(value instanceof Uint8Array)) {
                throw new RepositoryControlRequestError(400);
            }
            if (value.byteLength > limit - size) {
                await reader.cancel().catch(() => undefined);
                throw new RepositoryControlRequestError(413);
            }
            chunks.push(value);
            size += value.byteLength;
        }
    } catch (error) {
        if (error instanceof RepositoryControlRequestError) {
            throw error;
        }
        await reader.cancel().catch(() => undefined);
        throw new RepositoryControlRequestError(400);
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

function contentLength(value: string | null): number | undefined {
    if (value === null) {
        return undefined;
    }
    if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
        throw new RepositoryControlRequestError(400);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new RepositoryControlRequestError(400);
    }
    return parsed;
}

function assertLimit(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError("Repository Control body limit must be a positive safe integer");
    }
}
