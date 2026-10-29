import { expect, test } from "bun:test";
import { createDescriptionCache } from "../../src/runtime/content/descriptionCache";
const value = { version: "1.0.0", capabilities: [{ id: "read", access: "public" as const }] };

test("description metadata coalesces per instance and invalidates immediately with the selection revision", async () => {
    let revision = 1;
    let loads = 0;
    const a = createDescriptionCache(async () => revision);
    const b = createDescriptionCache(async () => revision);
    const load = async () => {
        loads++;
        return structuredClone(value);
    };
    await Promise.all(Array.from({ length: 200 }, () => a("contract", 1, load)));
    expect(loads).toBe(1);
    await b("contract", 1, load);
    expect(loads).toBe(2);
    revision = 2;
    await a("contract", 2, load);
    expect(loads).toBe(3);
});
test("a selection change during a load never stores its result under the old revision", async () => {
    let revision = 1;
    let loads = 0;
    const cache = createDescriptionCache(async () => revision);
    const first = await cache("contract", 1, async () => {
        loads++;
        revision = 2;
        return value;
    });
    expect(first).toEqual(value);
    await cache("contract", 1, async () => {
        loads++;
        return value;
    });
    expect(loads).toBe(2);
    const restricted = { ...value, capabilities: [{ id: "read", access: "admin" as const }] };
    expect(await cache("contract", 2, async () => restricted)).toEqual(restricted);
});
test("failed, missing and oversized descriptions are retried; distinct pending loads are bounded", async () => {
    const cache = createDescriptionCache(async () => 1);
    let loads = 0;
    await expect(
        cache("contract", 1, async () => {
            throw new Error("unavailable");
        }),
    ).rejects.toThrow();
    expect(await cache("contract", 1, async () => null)).toBeNull();
    await cache("contract", 1, async () => {
        loads++;
        return value;
    });
    expect(loads).toBe(1);
    const huge = { ...value, version: "x".repeat(70_000) };
    for (let i = 0; i < 2; i++) {
        await cache("huge", 1, async () => {
            loads++;
            return huge;
        });
    }
    expect(loads).toBe(3);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
        release = resolve;
    });
    const tasks = Array.from({ length: 16 }, (_, index) =>
        cache(`pending-${index}`, 1, async () => {
            await barrier;
            return value;
        }),
    );
    await expect(cache("overflow", 1, async () => value)).rejects.toThrow("capacity");
    release();
    await Promise.all(tasks);
});
test("entry and byte bounds evict metadata and shared snapshots are immutable", async () => {
    const cache = createDescriptionCache(async () => 1);
    let loads = 0;
    const load = async () => {
        loads++;
        return { ...value, version: "x".repeat(60_000) };
    };
    for (let i = 0; i < 5; i++) {
        await cache(`contract-${i}`, 1, load);
    }
    await cache("contract-0", 1, load);
    expect(loads).toBe(6);
    const small = createDescriptionCache(async () => 1);
    let reads = 0;
    for (let i = 0; i < 65; i++) {
        await small(`contract-${i}`, 1, async () => {
            reads++;
            return value;
        });
    }
    const result = await small("contract-0", 1, async () => {
        reads++;
        return value;
    });
    expect(reads).toBe(66);
    expect(() => {
        result!.capabilities[0]!.access = "admin";
    }).toThrow();
});

test("coalesced description waiters are bounded without issuing extra Provider calls", async () => {
    const cache = createDescriptionCache(async () => 1);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
        release = resolve;
    });
    let calls = 0;
    const load = async () => {
        calls++;
        await barrier;
        return value;
    };
    const tasks = Array.from({ length: 256 }, () => cache("contract", 1, load));
    await expect(cache("contract", 1, load)).rejects.toThrow("waiter capacity");
    release();
    await Promise.all(tasks);
    expect(calls).toBe(1);
});
