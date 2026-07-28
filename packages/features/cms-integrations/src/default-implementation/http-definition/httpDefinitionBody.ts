import { IntegrationRepositoryContractError } from "../../core/errors";

// A remote definition or asset cannot exceed its source bundle's public ceiling.
export const MAX_INTEGRATION_REPOSITORY_RESPONSE_BYTES = 16 * 1_024 * 1_024;

type BoundedResponseOptions = Readonly<{
    maxBytes?: number;
    signal?: AbortSignal;
    allowMissingBody?: boolean;
}>;

export async function readBoundedResponseBody(
    response: Response,
    options: BoundedResponseOptions = {},
): Promise<Uint8Array> {
    const maxBytes = options.maxBytes ?? MAX_INTEGRATION_REPOSITORY_RESPONSE_BYTES;
    const declaredLength = await responseContentLength(response, maxBytes);
    if (!response.body) {
        if (options.allowMissingBody && (declaredLength === undefined || declaredLength === 0)) {
            return new Uint8Array();
        }
        throw new IntegrationRepositoryContractError();
    }

    const reader = response.body.getReader();
    const cancelOnAbort = () => {
        void reader.cancel().catch(() => undefined);
    };
    options.signal?.addEventListener("abort", cancelOnAbort, { once: true });
    if (options.signal?.aborted) {
        await reader.cancel().catch(() => undefined);
    }

    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (!(value instanceof Uint8Array) || value.byteLength > maxBytes - length) {
                await reader.cancel().catch(() => undefined);
                throw new IntegrationRepositoryContractError();
            }
            chunks.push(value);
            length += value.byteLength;
        }
    } finally {
        options.signal?.removeEventListener("abort", cancelOnAbort);
        reader.releaseLock();
    }
    if (declaredLength !== undefined && hasIdentityEncoding(response) && declaredLength !== length) {
        throw new IntegrationRepositoryContractError();
    }

    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

async function responseContentLength(response: Response, maxBytes: number): Promise<number | undefined> {
    const value = response.headers.get("content-length");
    if (value === null) {
        return undefined;
    }
    if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
        await response.body?.cancel().catch(() => undefined);
        throw new IntegrationRepositoryContractError();
    }
    const length = Number(value);
    if (!Number.isSafeInteger(length) || length > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new IntegrationRepositoryContractError();
    }
    return length;
}

function hasIdentityEncoding(response: Response): boolean {
    const encoding = response.headers.get("content-encoding")?.trim().toLowerCase();
    return !encoding || encoding === "identity";
}
