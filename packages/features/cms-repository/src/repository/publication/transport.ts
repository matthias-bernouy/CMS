export function repositoryUrl(value: string): URL {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
        (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new Error("Repository URL must use HTTPS or loopback HTTP without embedded credentials");
    }
    return new URL(`${url.toString().replace(/\/+$/u, "")}/`);
}

export async function boundedResponseBytes(response: Response, maximum: number): Promise<Uint8Array> {
    const declared = Number(response.headers.get("content-length"));
    if ((Number.isFinite(declared) && declared > maximum) || maximum < 0) {
        throw new Error("Repository response exceeds its declared byte limit");
    }
    if (!response.body) {
        throw new Error("Repository response has no body");
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
            if (length > maximum) {
                await reader.cancel();
                throw new Error("Repository response exceeds its declared byte limit");
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
