import { expect, test } from "bun:test";
import { tenantProfiler } from "./mongo-profile";

test("tenant profiling preserves pristine Control, coalesces setup and waits before releasing callers", async () => {
    const configuring = new WeakSet<object>();
    const profile = tenantProfiler(configuring);
    const calls: unknown[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const database = {
        databaseName: "mcp_provider_control",
        async createCollection(name: string, options: unknown) {
            calls.push([name, options]);
            await gate;
        },
        async command(value: unknown) {
            calls.push(value);
        },
    };
    const client = { db: () => database, async close() {} };
    await profile(client);
    expect(calls).toEqual([]);
    database.databaseName = "ulvia_owned_tenant";
    let completed = 0;
    const first = profile(client).then(() => {
        completed++;
    });
    const second = profile(client).then(() => {
        completed++;
    });
    expect(configuring.has(client)).toBe(true);
    expect(completed).toBe(0);
    expect(calls).toEqual([["system.profile", { capped: true, size: 67108864 }]]);
    release();
    await Promise.all([first, second]);
    expect(completed).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
        profile: 2,
        filter: {
            $or: [
                { "command.comment.ulviaPerformanceTrace": { $exists: true } },
                { "originatingCommand.comment.ulviaPerformanceTrace": { $exists: true } },
            ],
        },
    });
    expect(configuring.has(client)).toBe(false);
    await profile(client);
    expect(calls).toHaveLength(2);
});

test("profiling preserves existing collections and closes failed loads before a retry", async () => {
    const configuring = new WeakSet<object>();
    const profile = tenantProfiler(configuring);
    let failures = true;
    let closed = 0;
    let configured = 0;
    const client = {
        db: () => ({
            databaseName: "ulvia_owned_tenant",
            async createCollection() {
                throw Object.assign(new Error("existing"), { code: 48 });
            },
            async command() {
                configured++;
                if (failures) {
                    throw new Error("profiling failed");
                }
            },
        }),
        async close() {
            closed++;
        },
    };
    await expect(profile(client)).rejects.toThrow("profiling failed");
    expect(closed).toBe(1);
    expect(configuring.has(client)).toBe(false);
    failures = false;
    await profile(client);
    expect(configured).toBe(2);
    expect(closed).toBe(1);
});
