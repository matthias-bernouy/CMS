/**
 * Removes runtime-specific file metadata from a storage stream.
 *
 * Bun otherwise applies the browser's Range header a second time when a
 * `Bun.file(...).stream()` is relayed through an HTTP Response. Range policy
 * belongs to the BlobStore caller, so adapters expose an ordinary byte stream.
 */
export function detachBlobStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    const reader = source.getReader();
    let released = false;

    const release = (): void => {
        if (!released) {
            released = true;
            reader.releaseLock();
        }
    };

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const chunk = await reader.read();
                if (chunk.done) {
                    release();
                    controller.close();
                    return;
                }
                controller.enqueue(chunk.value);
            } catch (error) {
                release();
                controller.error(error);
            }
        },
        async cancel(reason) {
            try {
                await reader.cancel(reason);
            } finally {
                release();
            }
        },
    });
}
