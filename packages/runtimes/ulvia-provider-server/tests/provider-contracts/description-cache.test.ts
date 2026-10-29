import { expect, test } from "bun:test";
import { createDescriptionCache } from "../../src/runtime/content/descriptionCache";
const value = { version: "1.0.0", capabilities: [{ id: "read", access: "public" as const }] };
test("description metadata coalesces per instance, expires after five seconds, and isolates instances", async () => {
    let clock = 0;
    let loads = 0;
    const a = createDescriptionCache(() => clock);
    const b = createDescriptionCache(() => clock);
    const load = async () => {
        loads++;
        return structuredClone(value);
    };
    await Promise.all(Array.from({ length: 200 }, () => a("contract", load)));
    expect(loads).toBe(1);
    await b("contract", load);
    expect(loads).toBe(2);
    clock = 4_999;
    await a("contract", load);
    expect(loads).toBe(2);
    clock = 5_000;
    await a("contract", load);
    expect(loads).toBe(3);
});
test("failed, missing and oversized descriptions are retried; distinct pending loads are bounded", async () => {
    const cache = createDescriptionCache();
    let loads = 0;
    await expect(
        cache("contract", async () => {
            throw new Error("unavailable");
        }),
    ).rejects.toThrow();
    expect(await cache("contract", async () => null)).toBeNull();
    await cache("contract", async () => {
        loads++;
        return value;
    });
    expect(loads).toBe(1);
    const huge = { ...value, version: "x".repeat(70_000) };
    for (let i = 0; i < 2; i++) {
        await cache("huge", async () => {
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
        cache(`pending-${index}`, async () => {
            await barrier;
            return value;
        }),
    );
    await expect(cache("overflow", async () => value)).rejects.toThrow("capacity");
    release();
    await Promise.all(tasks);
});
test("entry and byte bounds evict metadata instead of retaining every contract", async () => {
    const cache = createDescriptionCache();
    let loads = 0;
    const load = async () => {
        loads++;
        return { ...value, version: "x".repeat(60_000) };
    };
    for (let i = 0; i < 5; i++) {
        await cache(`contract-${i}`, load);
    }
    await cache("contract-0", load);
    expect(loads).toBe(6);
    const small = createDescriptionCache();
    let reads = 0;
    for (let i = 0; i < 65; i++) {
        await small(`contract-${i}`, async () => {
            reads++;
            return value;
        });
    }
    await small("contract-0", async () => {
        reads++;
        return value;
    });
    expect(reads).toBe(66);
});

test("shared description snapshots cannot be mutated by another caller", async () => {
    const cache = createDescriptionCache();
    const result = await cache("contract", async () => structuredClone(value));
    expect(() => {
        result!.capabilities[0]!.access = "admin";
    }).toThrow();
    expect((await cache("contract", async () => null))!.capabilities[0]!.access).toBe("public");
});
