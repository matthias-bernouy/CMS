import { expect, test } from "bun:test";
import { EdgeContextPool } from "../../src/runtime/hosting/ContextPool";

const bounds = {
    maxEntries: 12,
    maxPending: 2,
    maxWaiters: 4,
    idleMs: 60_000,
    admission: { maxQueued: 8, waitMs: 1000 },
};

test("cold tenant bursts wait without exceeding active load or context bounds", async () => {
    const gate = Promise.withResolvers<void>();
    let active = 0;
    let peak = 0;
    let calls = 0;
    const pool = new EdgeContextPool(
        async (key) => {
            active++;
            peak = Math.max(peak, active);
            calls++;
            await gate.promise;
            active--;
            return key;
        },
        async () => {},
        bounds,
    );
    const jobs = Array.from({ length: 10 }, (_, i) => pool.acquire(`tenant:${i}`));
    try {
        await Bun.sleep(0);
        expect(pool.snapshot()).toMatchObject({ live: 2, pending: 2, queued: 8 });
        gate.resolve();
        const leases = await Promise.all(jobs);
        expect(peak).toBe(2);
        expect(calls).toBe(10);
        expect(leases.map((lease) => lease.context)).toEqual(Array.from({ length: 10 }, (_, i) => `tenant:${i}`));
        leases.forEach((lease) => lease.release());
    } finally {
        gate.resolve();
        for (const result of await Promise.allSettled(jobs)) {
            if (result.status === "fulfilled") {
                result.value.release();
            }
        }
        await pool.close();
    }
    expect(pool.snapshot()).toMatchObject({ live: 0, pending: 0, queued: 0 });
});

test("overflow, expiry, abort and shutdown cannot start abandoned tenant loads", async () => {
    const gate = Promise.withResolvers<void>();
    const calls: string[] = [];
    const pool = new EdgeContextPool(
        async (key) => {
            calls.push(key);
            await gate.promise;
            return key;
        },
        async () => {},
        { ...bounds, maxPending: 1, admission: { maxQueued: 1, waitMs: 15 } },
    );
    const first = pool.acquire("first");
    try {
        const expired = pool.acquire("expired");
        await expect(pool.acquire("overflow")).rejects.toThrow("capacity");
        await expect(expired).rejects.toThrow("expired");
        const abort = new AbortController();
        const abandoned = pool.acquire("aborted", abort.signal);
        abort.abort(new Error("caller gone"));
        await expect(abandoned).rejects.toThrow("caller gone");
        const closed = pool.acquire("closed");
        const closing = pool.close();
        await expect(closed).rejects.toThrow("closed");
        gate.resolve();
        (await first).release();
        await closing;
        expect(calls).toEqual(["first"]);
        expect(pool.snapshot()).toMatchObject({ live: 0, pending: 0, queued: 0 });
    } finally {
        gate.resolve();
        (await first).release();
        await pool.close();
    }
});

test("failed cold loads wake queued tenants and same-key waiters still coalesce", async () => {
    const gate = Promise.withResolvers<void>();
    let calls = 0;
    const pool = new EdgeContextPool(
        async (key) => {
            calls++;
            if (key === "broken") {
                await gate.promise;
                throw new Error("load failed");
            }
            return key;
        },
        async () => {},
        { ...bounds, maxPending: 1 },
    );
    const broken = pool.acquire("broken");
    void broken.catch(() => undefined);
    const one = pool.acquire("ready");
    const two = pool.acquire("ready");
    gate.resolve();
    await expect(broken).rejects.toThrow("load failed");
    const leases = await Promise.all([one, two]);
    expect(calls).toBe(2);
    leases.forEach((lease) => lease.release());
    await pool.close();
});
