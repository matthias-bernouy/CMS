import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
/** Limit allocation before JSON parsing, including requests with no Content-Length. */
export async function collectionBody(req: Request): Promise<Record<string, unknown>> {
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!reader) {
        throw Object.assign(new Error("JSON body required"), { status: 400 });
    }
    try {
        while (true) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            size += part.value.byteLength;
            if (size > 3 * 1024 * 1024) {
                await reader.cancel();
                throw Object.assign(new Error("Collection request is too large"), { status: 413 });
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let cursor = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, cursor);
        cursor += chunk.byteLength;
    }
    try {
        const value = parseStrictJson(bytes, 3 * 1024 * 1024, 64);
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Object required");
        }
        return value as Record<string, unknown>;
    } catch {
        throw Object.assign(new Error("Invalid collection JSON"), { status: 400 });
    }
}
