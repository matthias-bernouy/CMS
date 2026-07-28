const READ_CHUNK_BYTES = 64 * 1_024;

export class RepositoryManagementGatewayBodyError extends Error {
    constructor(
        readonly status: 400 | 413,
        message: string,
    ) {
        super(message);
    }
}

export async function readGatewayBody(request: Request, limit: number): Promise<Uint8Array> {
    const declared = request.headers.get("content-length");
    if (declared !== null) {
        if (!/^[0-9]+$/u.test(declared)) {
            throw new RepositoryManagementGatewayBodyError(400, "Content-Length is invalid");
        }
        const size = Number(declared);
        if (!Number.isSafeInteger(size) || size > limit) {
            throw new RepositoryManagementGatewayBodyError(413, "Management request body is too large");
        }
    }
    if (!request.body) {
        return new Uint8Array();
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const result = await reader.read();
            if (result.done) {
                break;
            }
            total += result.value.byteLength;
            if (total > limit) {
                throw new RepositoryManagementGatewayBodyError(413, "Management request body is too large");
            }
            chunks.push(result.value);
        }
    } finally {
        reader.releaseLock();
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

export function injectAuthenticatedActor(body: Uint8Array, actor: string, limit: number): Uint8Array {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    } catch {
        throw new RepositoryManagementGatewayBodyError(400, "Management request body must be valid UTF-8 JSON");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RepositoryManagementGatewayBodyError(400, "Management request body must be a JSON object");
    }
    const encoded = new TextEncoder().encode(JSON.stringify({ ...(value as Record<string, unknown>), actor }));
    if (encoded.byteLength > limit) {
        throw new RepositoryManagementGatewayBodyError(413, "Management request body is too large");
    }
    return encoded;
}

export function assertGatewayBodyLimit(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < READ_CHUNK_BYTES) {
        throw new TypeError(`${label} must be a safe integer of at least ${READ_CHUNK_BYTES}`);
    }
}
