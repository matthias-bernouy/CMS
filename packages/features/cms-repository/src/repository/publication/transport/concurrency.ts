export async function concurrentlyMap<T, R>(
    values: readonly T[],
    concurrency: number,
    transform: (value: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(values.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < values.length) {
            const index = nextIndex++;
            results[index] = await transform(values[index]!);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
    return results;
}
