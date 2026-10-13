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

test("a retained background resource is not disposed after its request lease becomes idle", async () => {
    const disposed: string[] = [];
    let retain!: () => () => void;
    const pool = new InstanceResourcePool(
        async (key, lifetime) => {
            retain = lifetime.retain;
            return key;
        },
        async (key) => void disposed.push(key),
        { maxEntries: 1, idleMs: 3 },
    );

    const request = await pool.acquire("instance");
    const releaseBackground = retain();
    request.release();
    await Bun.sleep(10);
    expect(disposed).toEqual([]);

    releaseBackground();
    await waitUntil(() => disposed.length === 1);
    expect(disposed).toEqual(["instance"]);
    await pool.close();
});

async function waitUntil(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 200;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            throw new Error("Timed out waiting for resource disposal");
        }
        await Bun.sleep(2);
    }
}
