import { expect, test } from "bun:test";
import { EdgeContextPool, EdgeContextCapacityError } from "../../../src/runtime/hosting/ContextPool";

const bounds = { maxEntries: 2, maxPending: 1, maxWaiters: 2, idleMs: 60_000 };

test("loads coalesce, while total contexts, pending loads and waiters have hard bounds", async () => {
    const ready = Promise.withResolvers<string>();
    let calls = 0;
    const pool = new EdgeContextPool(
        async () => {
            calls++;
            return ready.promise;
        },
        async () => {},
        bounds,
    );
    const one = pool.acquire("a");
    const two = pool.acquire("a");
    await expect(pool.acquire("a")).rejects.toBeInstanceOf(EdgeContextCapacityError);
    await expect(pool.acquire("b")).rejects.toBeInstanceOf(EdgeContextCapacityError);
    expect(pool.snapshot()).toMatchObject({ live: 1, pending: 1 });
    ready.resolve("tenant-a");
    const leases = await Promise.all([one, two]);
    expect(calls).toBe(1);
    leases.forEach((lease) => lease.release());
    await pool.close();
    expect(pool.snapshot()).toMatchObject({ live: 0, pending: 0 });
});

test("active contexts are not evicted and revisions create distinct contexts", async () => {
    const disposed: string[] = [];
    const pool = new EdgeContextPool(
        async (key) => key,
        async (key) => {
            disposed.push(key);
        },
        bounds,
    );
    const a = await pool.acquire("a:revision-1");
    const b = await pool.acquire("b:revision-1");
    await expect(pool.acquire("a:revision-2")).rejects.toBeInstanceOf(EdgeContextCapacityError);
    a.release();
    const revised = await pool.acquire("a:revision-2");
    expect(disposed).toEqual(["a:revision-1"]);
    expect(b.context).toBe("b:revision-1");
    b.release();
    revised.release();
    await pool.close();
});

test("failed loads release admission slots and can be retried", async () => {
    let attempt = 0;
    const pool = new EdgeContextPool(
        async () => {
            if (++attempt === 1) {
                throw new Error("unavailable");
            }
            return "ready";
        },
        async () => {},
        bounds,
    );
    await expect(pool.acquire("a")).rejects.toThrow("unavailable");
    expect(pool.snapshot()).toMatchObject({ live: 0, pending: 0 });
    const lease = await pool.acquire("a");
    lease.release();
    await pool.close();
});

test("shutdown waits for response leases and rejects new acquisitions", async () => {
    let disposed = false;
    const pool = new EdgeContextPool(
        async () => "a",
        async () => {
            disposed = true;
        },
        bounds,
    );
    const lease = await pool.acquire("a");
    let closed = false;
    const closing = pool.close().then(() => {
        closed = true;
    });
    await expect(pool.acquire("b")).rejects.toThrow("closed");
    expect(disposed).toBe(false);
    expect(closed).toBe(false);
    lease.release();
    lease.release();
    await closing;
    expect(disposed).toBe(true);
});

test("slow disposal does not open an unbounded replacement admission window", async () => {
    const release = Promise.withResolvers<void>();
    const pool = new EdgeContextPool(
        async (key) => key,
        async () => release.promise,
        { ...bounds, maxEntries: 1 },
    );
    const first = await pool.acquire("a");
    first.release();
    const replacement = pool.acquire("b");
    await expect(pool.acquire("c")).rejects.toBeInstanceOf(EdgeContextCapacityError);
    expect(pool.snapshot().live).toBe(1);
    release.resolve();
    const lease = await replacement;
    lease.release();
    await pool.close();
});

test("failed resource disposal closes admission and is reported by shutdown", async () => {
    const pool = new EdgeContextPool(
        async (key) => key,
        async () => {
            throw new Error("resource cleanup failed");
        },
        { ...bounds, maxEntries: 1 },
    );
    const first = await pool.acquire("a");
    first.release();
    await expect(pool.acquire("b")).rejects.toThrow("closed");
    await expect(pool.acquire("c")).rejects.toThrow("closed");
    await expect(pool.close()).rejects.toThrow("resource cleanup failed");
});

test("aborting an ingress releases its lease while retaining the unfinished load bound", async () => {
    const ready = Promise.withResolvers<string>();
    const pool = new EdgeContextPool(
        async () => ready.promise,
        async () => {},
        bounds,
    );
    const controller = new AbortController();
    const loading = pool.acquire("a", controller.signal);
    controller.abort(new Error("caller gone"));
    await expect(loading).rejects.toThrow("caller gone");
    expect(pool.snapshot()).toMatchObject({ live: 1, pending: 1 });
    await expect(pool.acquire("b")).rejects.toBeInstanceOf(EdgeContextCapacityError);
    const closing = pool.close();
    ready.resolve("ready");
    await closing;
    expect(pool.snapshot()).toMatchObject({ live: 0, pending: 0 });
});
