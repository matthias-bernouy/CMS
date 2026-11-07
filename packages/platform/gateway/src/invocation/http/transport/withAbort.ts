/** Enforces a deadline even when an injected adapter does not honor its signal. */
export async function withAbort<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        throw signal.reason;
    }
    let onAbort: () => void = () => undefined;
    try {
        return await Promise.race([
            work(),
            new Promise<never>((_resolve, reject) => {
                onAbort = () => reject(signal.reason);
                signal.addEventListener("abort", onAbort, { once: true });
                if (signal.aborted) {
                    onAbort();
                }
            }),
        ]);
    } finally {
        signal.removeEventListener("abort", onAbort);
    }
}
