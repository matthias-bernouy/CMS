/** Keep the root delegation alive until its binary result finishes or is cancelled. */
export function delegationStream(
    stream: ReadableStream<Uint8Array>,
    finish: () => Promise<void>,
): ReadableStream<Uint8Array> {
    const reader = stream.getReader();
    let cancelled = false;
    let completion: Promise<void> | undefined;
    const complete = () =>
        (completion ??= (async () => {
            try {
                await finish();
            } finally {
                reader.releaseLock();
            }
        })());
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const part = await reader.read();
                if (cancelled) {
                    return;
                }
                if (part.done) {
                    await complete();
                    if (!cancelled) {
                        controller.close();
                    }
                } else {
                    controller.enqueue(part.value);
                }
            } catch (error) {
                await complete();
                if (!cancelled) {
                    controller.error(error);
                }
            }
        },
        async cancel(reason) {
            cancelled = true;
            try {
                await reader.cancel(reason);
            } finally {
                await complete();
            }
        },
    });
}
