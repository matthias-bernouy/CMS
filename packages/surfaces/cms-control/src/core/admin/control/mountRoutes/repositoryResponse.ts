import { RepositoryControlRequestError } from "cms-control/core/admin/control/mountRoutes/repositoryBody";

const MAX_GATEWAY_RESPONSE_BYTES = 8 * 1_024 * 1_024;
const ALLOWED_GATEWAY_STATUSES = new Set([200, 201, 400, 404, 409, 413, 422, 429, 503]);

export async function repositoryGatewayResponse(response: Response): Promise<Response> {
    if (!ALLOWED_GATEWAY_STATUSES.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        return repositoryUnavailableResponse();
    }
    const declared = response.headers.get("content-length");
    if (declared && (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_GATEWAY_RESPONSE_BYTES)) {
        await response.body?.cancel().catch(() => undefined);
        return repositoryUnavailableResponse();
    }
    try {
        const bytes = await readGatewayBody(response.body);
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        const body = JSON.parse(text) as unknown;
        const retryAfter = normalizedRetryAfter(response.headers.get("retry-after"));
        return new Response(JSON.stringify(body), {
            status: response.status,
            headers: {
                "cache-control": "no-store",
                "content-type": "application/json; charset=utf-8",
                ...(retryAfter ? { "retry-after": retryAfter } : {}),
            },
        });
    } catch {
        await response.body?.cancel().catch(() => undefined);
        return repositoryUnavailableResponse();
    }
}

export function repositoryControlErrorResponse(error: unknown): Response {
    if (error instanceof RepositoryControlRequestError) {
        return repositoryJsonResponse(error.status, {
            code: error.status === 413 ? "repository_request_too_large" : "repository_request_invalid",
            error: error.message,
        });
    }
    return repositoryUnavailableResponse();
}

export function repositoryUnavailableResponse(): Response {
    return repositoryJsonResponse(503, {
        code: "repository_management_unavailable",
        error: "Integration repository management is unavailable",
    });
}

export function repositoryJsonResponse(status: number, body: Readonly<Record<string, unknown>>): Response {
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function readGatewayBody(body: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
    if (!body) {
        throw new TypeError("Gateway response body is missing");
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (value.byteLength > MAX_GATEWAY_RESPONSE_BYTES - size) {
                await reader.cancel().catch(() => undefined);
                throw new TypeError("Gateway response is too large");
            }
            chunks.push(value);
            size += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

function normalizedRetryAfter(value: string | null): string | undefined {
    return value && /^[1-9][0-9]*$/u.test(value) ? value : undefined;
}
