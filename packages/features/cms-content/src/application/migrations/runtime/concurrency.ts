const PAGE_OPERATION_CONCURRENCY = 16;

export async function forEachMigrationPage<T>(
    items: readonly T[],
    operation: (item: T) => Promise<void>,
): Promise<void> {
    for (let start = 0; start < items.length; start += PAGE_OPERATION_CONCURRENCY) {
        const results = await Promise.allSettled(items.slice(start, start + PAGE_OPERATION_CONCURRENCY).map(operation));
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") {
            throw failed.reason;
        }
    }
}
