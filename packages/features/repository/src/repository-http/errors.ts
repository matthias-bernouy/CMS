/** Transport facts only; each consuming domain interprets statuses and bounded error bytes. */
export class RepositoryHttpError extends Error {
    constructor(
        readonly status: number,
        readonly body?: Uint8Array,
    ) {
        super(`Repository HTTP request failed (${status})`);
    }
}
export class RepositoryResponseTooLargeError extends Error {}

export async function repositoryErrorBody(response: Response): Promise<Uint8Array | undefined> {
    if (!response.body) {
        return undefined;
    }
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        await response.body.cancel();
        return undefined;
    }
    const reader = response.body.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const expired = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Error response deadline exceeded")), 100);
    });
    try {
        for (;;) {
            const part = await Promise.race([reader.read(), expired]);
            if (part.done) {
                break;
            }
            size += part.value.byteLength;
            if (size > 4096) {
                return undefined;
            }
            chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return bytes;
    } catch {
        return undefined;
    } finally {
        clearTimeout(timer);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
