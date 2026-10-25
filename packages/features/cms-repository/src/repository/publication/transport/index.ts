import { repositoryBaseUrl } from "cms-repository/repository-http/baseUrl";

export function repositoryUrl(value: string, options: Readonly<{ allowInsecureHttp?: boolean }> = {}): URL {
    return repositoryBaseUrl(value, "Publication", options);
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
