const JSON_MEDIA_TYPE = "application/json";

export class RepositoryManagementJsonBodyError extends Error {
    constructor(readonly status: 400 | 413) {
        super(
            status === 413
                ? "Repository management request body is too large"
                : "Repository management request is invalid",
        );
        this.name = "RepositoryManagementJsonBodyError";
    }
}

export async function readRepositoryManagementJsonBody(request: Request, maxBytes: number): Promise<unknown> {
    assertLimit(maxBytes);
    assertRepresentation(request.headers);
    const declaredLength = parseContentLength(request.headers.get("content-length"));
    if (declaredLength !== undefined && declaredLength > maxBytes) {
        throw new RepositoryManagementJsonBodyError(413);
    }
    const bytes = await readBoundedBody(request.body, maxBytes);
    if (declaredLength !== undefined && declaredLength !== bytes.byteLength) {
        throw new RepositoryManagementJsonBodyError(400);
    }
    try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return JSON.parse(text) as unknown;
    } catch {
        throw new RepositoryManagementJsonBodyError(400);
    }
}

async function readBoundedBody(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
    if (!body) {
        throw new RepositoryManagementJsonBodyError(400);
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (!(value instanceof Uint8Array)) {
                throw new RepositoryManagementJsonBodyError(400);
            }
            if (value.byteLength > maxBytes - total) {
                await reader.cancel().catch(() => undefined);
                throw new RepositoryManagementJsonBodyError(413);
            }
            chunks.push(value);
            total += value.byteLength;
        }
    } catch (error) {
        if (error instanceof RepositoryManagementJsonBodyError) {
            throw error;
        }
        await reader.cancel().catch(() => undefined);
        throw new RepositoryManagementJsonBodyError(400);
    } finally {
        reader.releaseLock();
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

function assertRepresentation(headers: Headers): void {
    const mediaType = headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const encoding = headers.get("content-encoding")?.trim().toLowerCase();
    if (mediaType !== JSON_MEDIA_TYPE || (encoding && encoding !== "identity")) {
        throw new RepositoryManagementJsonBodyError(400);
    }
}

function parseContentLength(value: string | null): number | undefined {
    if (value === null) {
        return undefined;
    }
    if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
        throw new RepositoryManagementJsonBodyError(400);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new RepositoryManagementJsonBodyError(400);
    }
    return parsed;
}

function assertLimit(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError("Repository management JSON body limit must be a positive safe integer");
    }
}
