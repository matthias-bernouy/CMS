export async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
    const deadline = performance.now() + timeoutMs;
    while (!condition()) {
        if (performance.now() >= deadline) {
            throw new Error("Timed out waiting for an asynchronous observability operation");
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
}
