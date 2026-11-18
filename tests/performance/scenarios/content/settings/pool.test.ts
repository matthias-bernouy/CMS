import { expect, test } from "bun:test";
import { fixturePool } from "./pool";

test("tenant leases preserve concurrent independence, refuse excess allocation and reuse bounded fixtures", async () => {
    const created: number[] = [];
    const pool = fixturePool(2, async (index) => {
        created.push(index);
        return { index };
    });
    const [first, second] = await Promise.all([pool.acquire(), pool.acquire()]);
    expect(first.value).not.toBe(second.value);
    await expect(pool.acquire()).rejects.toThrow("fixture-tenant-pool-exhausted");
    first.release();
    const reused = await pool.acquire();
    expect(reused.value).toBe(first.value);
    first.release();
    await expect(pool.acquire()).rejects.toThrow("fixture-tenant-pool-exhausted");
    reused.release();
    second.release();
    expect(created).toEqual([0, 1]);
});

test("failed fixture creation releases its lease without provisioning unbounded replacement tenants", async () => {
    let attempts = 0;
    const pool = fixturePool(1, async () => {
        attempts++;
        throw new Error("Preparation refused");
    });
    await expect(pool.acquire()).rejects.toThrow("Preparation refused");
    await expect(pool.acquire()).rejects.toThrow("Preparation refused");
    expect(attempts).toBe(1);
    expect(() => fixturePool(0, async () => null)).toThrow();
});

test("synchronous fixture construction failures remain bounded too", async () => {
    let attempts = 0;
    const pool = fixturePool(1, () => {
        attempts++;
        throw new Error("Synchronous preparation refused");
    });
    await expect(pool.acquire()).rejects.toThrow("Synchronous preparation refused");
    await expect(pool.acquire()).rejects.toThrow("Synchronous preparation refused");
    expect(attempts).toBe(1);
});
