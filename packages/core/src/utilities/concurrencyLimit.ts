/**
 * Returns a function that runs at most `max` async tasks concurrently.
 * Subsequent tasks queue and start in FIFO order as slots free up. The
 * returned promise reflects the wrapped task's outcome — failures don't
 * affect siblings, exceptions propagate to the caller.
 *
 * In-process semaphore, no shared state across processes — fine for a
 * single bun runtime that fans out work, not a substitute for a
 * distributed lock.
 */
export type ConcurrencyLimit = <T>(fn: () => Promise<T>) => Promise<T>;

export function createConcurrencyLimit(max: number): ConcurrencyLimit {
    if (!Number.isInteger(max) || max < 1) {
        throw new Error(`createConcurrencyLimit: max must be a positive integer (got ${max}).`);
    }

    let active = 0;
    const queue: Array<() => void> = [];

    const next = () => {
        if (active >= max) return;
        const run = queue.shift();
        if (!run) return;
        active++;
        run();
    };

    return <T>(fn: () => Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            queue.push(() => {
                fn().then(
                    (value) => { active--; next(); resolve(value); },
                    (error) => { active--; next(); reject(error); },
                );
            });
            next();
        });
}
