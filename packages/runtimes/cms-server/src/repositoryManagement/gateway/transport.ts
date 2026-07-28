import { assertIJsonValue, parseStrictJsonDocument } from "@bernouy/cms-integration-packages";

export const REPOSITORY_MANAGEMENT_RESPONSE_LIMIT_BYTES = 8 * 1_024 * 1_024;
export const REPOSITORY_MANAGEMENT_UPLOAD_LIMIT_BYTES = 32 * 1_024 * 1_024;

export type RepositoryManagementTransportResponse = Readonly<{
    status: number;
    body: unknown;
    retryAfter: string | null;
}>;

export type RepositoryManagementTransportRequest = Readonly<{
    fetch: typeof fetch;
    url: URL;
    token: string;
    timeoutMs: number;
    method: "GET" | "POST";
    body?: Uint8Array;
}>;

export async function repositoryManagementRequest(
    request: RepositoryManagementTransportRequest,
): Promise<RepositoryManagementTransportResponse> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
            controller.abort();
            reject(new RepositoryManagementTransportError());
        }, request.timeoutMs);
    });
    try {
        return await Promise.race([performRequest(request, controller.signal), expired]);
    } catch {
        throw new RepositoryManagementTransportError();
    } finally {
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }
    }
}

async function performRequest(
    request: RepositoryManagementTransportRequest,
    signal: AbortSignal,
): Promise<RepositoryManagementTransportResponse> {
    const response = await request.fetch(request.url, {
        method: request.method,
        headers: {
            accept: "application/json",
            authorization: `Bearer ${request.token}`,
            ...(request.method === "POST" ? { "content-type": "application/json" } : {}),
        },
        ...(request.body ? { body: request.body.slice().buffer as ArrayBuffer } : {}),
        credentials: "omit",
        redirect: "error",
        signal,
    });
    if (!allowedTransportStatus(response.status)) {
        await cancelBody(response.body);
        throw new RepositoryManagementTransportError();
    }
    let declaredLength: number | undefined;
    try {
        assertJsonContentType(response);
        declaredLength = parseContentLength(response.headers.get("content-length"));
    } catch {
        await cancelBody(response.body);
        throw new RepositoryManagementTransportError();
    }
    if (declaredLength !== undefined && declaredLength > REPOSITORY_MANAGEMENT_RESPONSE_LIMIT_BYTES) {
        await cancelBody(response.body);
        throw new RepositoryManagementTransportError();
    }
    const bytes = await readBoundedBody(response.body, signal);
    const body = parseJson(bytes);
    return { status: response.status, body, retryAfter: response.headers.get("retry-after") };
}

function allowedTransportStatus(status: number): boolean {
    return status >= 200 && status <= 599 && status !== 204 && status !== 205 && status !== 304;
}

function assertJsonContentType(response: Response): void {
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
        throw new RepositoryManagementTransportError();
    }
}

async function readBoundedBody(body: ReadableStream<Uint8Array> | null, signal: AbortSignal): Promise<Uint8Array> {
    const reader = body?.getReader();
    if (!reader) {
        throw new RepositoryManagementTransportError();
    }
    const abort = () => {
        void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", abort, { once: true });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        signal.throwIfAborted();
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (
                !(value instanceof Uint8Array) ||
                value.byteLength > REPOSITORY_MANAGEMENT_RESPONSE_LIMIT_BYTES - size
            ) {
                await reader.cancel().catch(() => undefined);
                throw new RepositoryManagementTransportError();
            }
            chunks.push(value);
            size += value.byteLength;
        }
    } finally {
        signal.removeEventListener("abort", abort);
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

function parseJson(bytes: Uint8Array): unknown {
    try {
        const value = parseStrictJsonDocument(bytes, REPOSITORY_MANAGEMENT_RESPONSE_LIMIT_BYTES);
        assertIJsonValue(value);
        return value;
    } catch {
        throw new RepositoryManagementTransportError();
    }
}

function parseContentLength(value: string | null): number | undefined {
    if (value === null) {
        return undefined;
    }
    if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
        throw new RepositoryManagementTransportError();
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new RepositoryManagementTransportError();
    }
    return parsed;
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
    await body?.cancel().catch(() => undefined);
}

export class RepositoryManagementTransportError extends Error {
    constructor() {
        super("Repository management transport failed");
        this.name = "RepositoryManagementTransportError";
    }
}
