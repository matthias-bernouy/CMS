/** Buffer only an admissible entry; preserve the live stream when it exceeds the bound. */
export async function readCacheBody(response: Response, maximum: number): Promise<Uint8Array<ArrayBuffer> | Response> {
    if (!response.body) {
        return new Uint8Array();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                reader.releaseLock();
                const bytes = new Uint8Array(length);
                let offset = 0;
                for (const chunk of chunks) {
                    bytes.set(chunk, offset);
                    offset += chunk.byteLength;
                }
                return bytes;
            }
            chunks.push(part.value);
            length += part.value.byteLength;
            if (length > maximum) {
                let index = 0;
                const stream = new ReadableStream<Uint8Array>({
                    async pull(controller) {
                        if (index < chunks.length) {
                            controller.enqueue(chunks[index++]!);
                            return;
                        }
                        try {
                            const next = await reader.read();
                            if (next.done) {
                                reader.releaseLock();
                                controller.close();
                            } else {
                                controller.enqueue(next.value);
                            }
                        } catch (error) {
                            reader.releaseLock();
                            controller.error(error);
                        }
                    },
                    async cancel(reason) {
                        try {
                            await reader.cancel(reason);
                        } finally {
                            reader.releaseLock();
                        }
                    },
                });
                return new Response(stream, { status: response.status, headers: response.headers });
            }
        }
    } catch (error) {
        try {
            await reader.cancel(error);
        } finally {
            reader.releaseLock();
        }
        throw error;
    }
}
