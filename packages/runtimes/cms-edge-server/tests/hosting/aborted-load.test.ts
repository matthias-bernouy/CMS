import { expect, test } from "bun:test";
import { EdgeContextPool } from "../../src/runtime/hosting/ContextPool";

const bounds = { maxEntries: 2, maxPending: 2, maxWaiters: 2, idleMs: 60_000 };

test("a failed creation after ingress abort and shutdown is accounted once without a disposal failure", async () => {
    const ready = Promise.withResolvers<string>();
    let disposals = 0;
    const pool = new EdgeContextPool(
        async () => ready.promise,
        async () => {
            disposals++;
        },
        bounds,
    );
    const controller = new AbortController();
    const loading = pool.acquire("a", controller.signal);
    controller.abort(new Error("caller gone"));
    await expect(loading).rejects.toThrow("caller gone");
    const closing = pool.close();
    void closing.catch(() => undefined);
    ready.reject(new Error("creation failed"));
    await Bun.sleep(0);
    expect(pool.snapshot()).toMatchObject({ live: 0, pending: 0, disposing: 0 });
    await closing;
    expect(disposals).toBe(0);
});

test("a retired aborted load cannot remove a new context under the same routing key", async () => {
    const old = Promise.withResolvers<string>();
    const next = Promise.withResolvers<string>();
    const disposed: string[] = [];
    let calls = 0;
    const pool = new EdgeContextPool(
        async () => (++calls === 1 ? old.promise : next.promise),
        async (value) => {
            disposed.push(value);
        },
        { ...bounds, idleMs: 1 },
    );
    const controller = new AbortController();
    const first = pool.acquire("a", controller.signal);
    controller.abort(new Error("caller gone"));
    await expect(first).rejects.toThrow("caller gone");
    for (let attempt = 0; attempt < 100 && pool.snapshot().entries !== 0; attempt++) {
        await Bun.sleep(1);
    }
    expect(pool.snapshot()).toMatchObject({ entries: 0, live: 1, pending: 1, disposing: 1 });
    const replacement = pool.acquire("a");
    old.reject(new Error("old creation failed"));
    await Bun.sleep(0);
    expect(pool.snapshot()).toMatchObject({ entries: 1, live: 1, pending: 1, disposing: 0 });
    next.resolve("replacement");
    const leases = await Promise.all([replacement, pool.acquire("a")]);
    expect(leases.map((lease) => lease.context)).toEqual(["replacement", "replacement"]);
    expect(calls).toBe(2);
    leases.forEach((lease) => lease.release());
    await pool.close();
    expect(disposed).toEqual(["replacement"]);
    expect(pool.snapshot()).toMatchObject({ entries: 0, live: 0, pending: 0, disposing: 0 });
});
