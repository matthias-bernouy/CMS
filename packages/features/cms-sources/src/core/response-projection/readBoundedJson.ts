type JsonReadResult =
    | { ok: true; value: unknown }
    | { ok: false };

/** Reads and parses one UTF-8 JSON stream without ever retaining over maxBytes. */
export async function readBoundedJson(
    body: ReadableStream<Uint8Array> | null,
    maxBytes: number,
): Promise<JsonReadResult> {
    if (!body) return { ok: false };
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > maxBytes) {
                await reader.cancel().catch(() => undefined);
                return { ok: false };
            }
            chunks.push(value);
        }

        const joined = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
            joined.set(chunk, offset);
            offset += chunk.byteLength;
        }
        const text = new TextDecoder("utf-8", { fatal: true }).decode(joined);
        return { ok: true, value: JSON.parse(text) };
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        if ((error as { name?: string })?.name === "AbortError") throw error;
        return { ok: false };
    }
}
