export type JsonReadFailureReason =
    | "missing_body"
    | "body_too_large"
    | "invalid_utf8"
    | "invalid_json"
    | "body_read_error";

type JsonReadResult =
    | { ok: true; value: unknown }
    | { ok: false; reason: JsonReadFailureReason };

/** Reads and parses one UTF-8 JSON stream without ever retaining over maxBytes. */
export async function readBoundedJson(
    body: ReadableStream<Uint8Array> | null,
    maxBytes: number,
): Promise<JsonReadResult> {
    if (!body) return { ok: false, reason: "missing_body" };
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let joined: Uint8Array;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > maxBytes) {
                await reader.cancel().catch(() => undefined);
                return { ok: false, reason: "body_too_large" };
            }
            chunks.push(value);
        }

        joined = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
            joined.set(chunk, offset);
            offset += chunk.byteLength;
        }
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        if ((error as { name?: string })?.name === "AbortError") throw error;
        return { ok: false, reason: "body_read_error" };
    }

    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(joined);
    } catch {
        return { ok: false, reason: "invalid_utf8" };
    }
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch {
        return { ok: false, reason: "invalid_json" };
    }
}
