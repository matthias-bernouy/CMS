import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";

/** Publication metadata is bounded independently of registry Content-Length declarations. */
export async function metadataBytes(
    response: Response,
    maximum: number,
    label: string,
    timeout = 15_000,
): Promise<Uint8Array> {
    if (!response.body) {
        throw new Error(`Missing ${label} metadata response`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} metadata read deadline exceeded`)), timeout);
    });
    try {
        for (;;) {
            const { done, value } = await Promise.race([reader.read(), deadline]);
            if (done) {
                break;
            }
            size += value.byteLength;
            if (size > maximum) {
                throw new Error(`${label} metadata exceeds its byte limit (${maximum})`);
            }
            chunks.push(value);
        }
        return Buffer.concat(chunks, size);
    } finally {
        clearTimeout(timer);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}

export async function metadataJson(response: Response, maximum: number, label: string): Promise<unknown> {
    const bytes = await metadataBytes(response, maximum, label);
    try {
        return parseStrictJson(bytes, maximum, 16);
    } catch (cause) {
        throw new Error(`Invalid ${label} JSON metadata`, { cause });
    }
}
