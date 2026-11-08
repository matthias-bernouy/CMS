import type { LogDetail } from "../model";

export async function getLogDetail(id: string, signal: AbortSignal): Promise<LogDetail> {
    const response = await fetch("/.cms/query/ulvia/cms.observability/logs.get", {
        method: "QUERY",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        signal,
    });
    if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error("Log details unavailable");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
                break;
            }
            size += chunk.value.byteLength;
            if (size > 65_536) {
                throw new Error("Log detail exceeds the response bound");
            }
            chunks.push(chunk.value);
        }
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const value = JSON.parse(new TextDecoder().decode(bytes)) as LogDetail;
    if (
        value.id !== id ||
        !value.attributes ||
        Array.isArray(value.attributes) ||
        typeof value.attributes !== "object" ||
        Object.keys(value.attributes).length > 24 ||
        Object.values(value.attributes).some((item) => typeof item !== "string" || item.length > 1024)
    ) {
        throw new Error("Invalid log detail response");
    }
    return value;
}
