import { expect, test } from "bun:test";
import { InstanceResourcePool } from "../src/runtime/instances/InstanceResourcePool";

test("the instance resource pool evicts idle resources before exceeding its bound", async () => {
    const disposed: string[] = [];
    const pool = new InstanceResourcePool(
        async (key) => key,
        async (key) => void disposed.push(key),
        {
            maxEntries: 1,
            idleMs: 60_000,
        },
    );

    const first = await pool.acquire("first");
    first.release();
    const second = await pool.acquire("second");

    expect(disposed).toEqual(["first"]);
    second.release();
    await pool.close();
    expect(disposed).toEqual(["first", "second"]);
});

test("an active resource is never disposed by overflow eviction", async () => {
    const disposed: string[] = [];
    const pool = new InstanceResourcePool(
        async (key) => key,
        async (key) => void disposed.push(key),
        {
            maxEntries: 1,
            idleMs: 60_000,
        },
    );

    const first = await pool.acquire("first");
    const second = await pool.acquire("second");
    expect(disposed).toEqual([]);

    first.release();
    await Promise.resolve();
    expect(disposed).toEqual(["first"]);
    second.release();
    await pool.close();
});
