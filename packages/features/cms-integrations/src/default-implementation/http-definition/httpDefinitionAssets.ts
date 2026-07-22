import type { IntegrationAsset } from "../../interfaces/IntegrationDefinitionRepository";

export async function responseAsset(response: Response, maxBytes?: number): Promise<IntegrationAsset> {
    return {
        bytes:
            maxBytes === undefined
                ? new Uint8Array(await response.arrayBuffer())
                : await readResponseBounded(response, maxBytes),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
}

async function readResponseBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
    const contentLength = response.headers.get("content-length");
    const declaredLength = contentLength === null ? undefined : Number(contentLength);
    if (typeof declaredLength === "number" && Number.isSafeInteger(declaredLength) && declaredLength > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw sizeError(maxBytes);
    }
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
            if (length > maxBytes) {
                await reader.cancel().catch(() => undefined);
                throw sizeError(maxBytes);
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

function sizeError(maxBytes: number): Error {
    return new Error(`Integration asset response exceeds ${maxBytes} bytes`);
}
