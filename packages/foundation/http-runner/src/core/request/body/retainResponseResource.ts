/** Keep a borrowed resource alive until its response stream ends, fails or is cancelled. */
export function retainResponseResource(response: Response, release: () => void, signal?: AbortSignal): Response {
    if (!response.body) {
        release();
        return response;
    }
    const reader = response.body.getReader();
    let finished = false;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const finish = () => {
        if (!finished) {
            finished = true;
            signal?.removeEventListener("abort", abort);
            reader.releaseLock();
            release();
        }
    };
    const abort = () => {
        if (!finished) {
            const reason = signal?.reason ?? new DOMException("Request aborted", "AbortError");
            controller.error(reason);
            void reader
                .cancel(reason)
                .catch(() => undefined)
                .finally(finish);
        }
    };
    const body = new ReadableStream<Uint8Array>({
        start(value) {
            controller = value;
            if (signal?.aborted) {
                abort();
            } else {
                signal?.addEventListener("abort", abort, { once: true });
            }
        },
        async pull(value) {
            try {
                const next = await reader.read();
                if (finished || signal?.aborted) {
                    return;
                }
                if (next.done) {
                    value.close();
                    finish();
                } else {
                    value.enqueue(next.value);
                }
            } catch (error) {
                if (!finished) {
                    value.error(error);
                    finish();
                }
            }
        },
        async cancel(reason) {
            try {
                await reader.cancel(reason);
            } finally {
                finish();
            }
        },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
