export const MAX_REPOSITORY_RESPONSE_BYTES = 8 * 1024 * 1024;

export type RepositoryFetch = (url: URL, init: RequestInit) => Promise<Response>;

/** Read a bounded repository response without following redirects. */
export async function getRepositoryBytes(
    base: URL,
    path: string,
    kind: string,
    options: { maxBytes?: number; accept?: string; request?: RepositoryFetch } = {},
): Promise<Uint8Array> {
    const maxBytes = options.maxBytes ?? MAX_REPOSITORY_RESPONSE_BYTES;
    const request = options.request ?? defaultRepositoryFetch;
    const response = await request(new URL(path, base), {
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
        headers: { Accept: options.accept ?? "application/json" },
    });
    if (!response.ok || !response.body) {
        throw new Error(`${kind} repository request failed (${response.status})`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            length += part.value.byteLength;
            if (length > maxBytes) {
                await reader.cancel();
                throw new Error(`${kind} repository response too large`);
            }
            chunks.push(part.value);
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

function defaultRepositoryFetch(url: URL, init: RequestInit): Promise<Response> {
    return fetch(url, init);
}
