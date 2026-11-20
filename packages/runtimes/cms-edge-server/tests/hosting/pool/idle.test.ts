import { expect, test, spyOn, setSystemTime } from "bun:test";
import { EdgeContextPool } from "../../../src/runtime/hosting/ContextPool";

/** Exercise real timer cancellation and the production default without waiting an actual day. */
test("default context retention renews for 24 hours on use and still evicts idle tenants at capacity", async () => {
    const day = 24 * 60 * 60_000;
    const initial = Date.now();
    const timers: { timer: ReturnType<typeof setTimeout>; expire: () => void }[] = [];
    const schedule = globalThis.setTimeout;
    const spy = spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) => {
        const timer = schedule(callback, delay, ...args);
        if (delay === day) {
            timers.push({ timer, expire: () => callback(...args) });
        }
        return timer;
    });
    let loads = 0;
    const disposed: string[] = [];
    const pool = new EdgeContextPool(
        async (key) => {
            loads++;
            return key;
        },
        async (key) => {
            disposed.push(key);
        },
        { maxEntries: 1, maxPending: 1, maxWaiters: 2 },
    );
    try {
        for (const hour of [0, 23, 46]) {
            setSystemTime(initial + hour * 60 * 60_000);
            const lease = await pool.acquire("a");
            expect(lease.context).toBe("a");
            lease.release();
        }
        expect(loads).toBe(1);
        expect(timers).toHaveLength(3);
        const replacement = await pool.acquire("b");
        expect(disposed).toEqual(["a"]);
        replacement.release();
        setSystemTime(initial + 70 * 60 * 60_000);
        timers.at(-1)!.expire();
        await pool.close();
        expect(disposed).toEqual(["a", "b"]);
    } finally {
        spy.mockRestore();
        setSystemTime();
        for (const { timer } of timers) {
            clearTimeout(timer);
        }
        await pool.close();
    }
});
