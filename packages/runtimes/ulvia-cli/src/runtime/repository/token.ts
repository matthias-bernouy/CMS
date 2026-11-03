/** Bounded stdin input keeps PATs out of command-line arguments and diagnostic output. */
export async function readRepositoryToken(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    let value = "";
    let size = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                return (value + decoder.decode()).trim();
            }
            size += part.value.byteLength;
            if (size > 128) {
                throw new Error("Repository token input exceeds its byte limit");
            }
            value += decoder.decode(part.value, { stream: true });
        }
    } finally {
        await reader.cancel();
        reader.releaseLock();
    }
}
