import { expect, test } from "bun:test";
import { ClusterLogs } from "@bernouy/observability/cluster";
import { fixture, row, window, cursorKey } from "./fixture";

test("instance tie breakers use the same binary order as Mongo even for mixed-case identifiers", async () => {
    const instanceIds = ["instance:A", "instance:a", "instance:b"];
    const f = fixture(instanceIds.map((id) => row(id, 1)));
    const observed: string[] = [];
    let cursor: string | undefined;
    do {
        const page = await f.service.query({ ...window, instanceIds, limit: 1, cursor });
        observed.push(...page.items.map((item) => item.instanceId));
        cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(observed).toEqual(["instance:b", "instance:a", "instance:A"]);
});

test("global keyset pagination preserves colliding IDs across tenants with bounded reads", async () => {
    const f = fixture([row("instance:a", 1), row("instance:b", 1), row("instance:a", 2), row("instance:b", 2)]);
    const input = { ...window, instanceIds: ["instance:a", "instance:b"], limit: 1 };
    const observed: string[] = [];
    let cursor: string | undefined;
    do {
        const result = await f.service.query({ ...input, cursor });
        observed.push(...result.items.map((row) => `${row.instanceId}/${row.id}`));
        expect(result.partial).toBe(false);
        cursor = result.nextCursor ?? undefined;
    } while (cursor);
    expect(observed).toEqual(
        [row("instance:b", 2), row("instance:a", 2), row("instance:b", 1), row("instance:a", 1)].map(
            (row) => `${row.instanceId}/${row.id}`,
        ),
    );
    expect(f.counts.queries).toBe(8);
    expect(f.counts.loaded).toBeLessThanOrEqual(8 * 2);
});
test("cursors bind host, filters, window, selection and expiry before source reads", async () => {
    const f = fixture([row("instance:a", 1), row("instance:a", 2)]);
    const input = { ...window, instanceIds: ["instance:a"], limit: 1 };
    const cursor = (await f.service.query(input)).nextCursor!;
    const opens = f.counts.opens;
    for (const change of [
        { instanceIds: ["instance:b"] },
        { event: "other.completed" },
        { limit: 2 },
        { from: "2026-11-21T10:01:00.000Z" },
        { cursor: `${cursor}x` },
    ]) {
        await expect(f.service.query({ ...input, cursor, ...change })).rejects.toThrow("INVALID_CURSOR");
    }
    const other = new ClusterLogs({ directory: f.directory, cursorKey, scopeId: "other-host" });
    await expect(other.query({ ...input, cursor })).rejects.toThrow("INVALID_CURSOR");
    f.setTime("2026-11-21T11:15:00.000Z");
    await expect(f.service.query({ ...input, cursor })).rejects.toThrow("INVALID_CURSOR");
    expect(f.counts.opens).toBe(opens);
});
test("partial coverage stays explicit and recovered sources remain excluded during pagination", async () => {
    const f = fixture([row("instance:a", 1), row("instance:a", 2), row("instance:b", 3)]);
    f.failures.set("instance:b", "unsupported");
    const input = { ...window, instanceIds: ["instance:a", "instance:b"], limit: 1 };
    const first = await f.service.query(input);
    expect(first.partial).toBe(true);
    expect(first.sources).toContainEqual({ instanceId: "instance:b", status: "unsupported" });
    f.failures.clear();
    const next = await f.service.query({ ...input, cursor: first.nextCursor! });
    expect(next.items.map((row) => row.instanceId)).toEqual(["instance:a"]);
    expect(next.partial).toBe(true);
    expect((await f.service.query(input)).partial).toBe(false);
});
test("get never substitutes another instance and missing versus unavailable remains distinct", async () => {
    const item = row("instance:a", 1);
    const f = fixture([item]);
    expect((await f.service.get({ instanceId: item.instanceId, id: item.id })).entry?.attributes).toEqual({
        note: "safe",
    });
    await expect(f.service.get({ instanceId: "instance:b", id: item.id })).rejects.toThrow("NOT_FOUND");
    f.failures.set("instance:b", "unavailable");
    expect(await f.service.get({ instanceId: "instance:b", id: item.id })).toMatchObject({
        partial: true,
        entry: null,
    });
});
test("selection bounds refuse before opening sources and fanout uses at most four workers", async () => {
    const f = fixture();
    for (const instanceIds of [
        [],
        ["instance:a", "instance:a"],
        ["../../foreign"],
        Array.from({ length: 17 }, (_, i) => `instance:${i}`),
    ]) {
        await expect(f.service.query({ ...window, instanceIds })).rejects.toThrow("INVALID_INPUT");
    }
    expect(f.counts.opens).toBe(0);
    await f.service.query({ ...window, instanceIds: Array.from({ length: 16 }, (_, i) => `instance:${i}`) });
    expect(f.maximumActive()).toBe(4);
    expect(f.counts.opens).toBe(16);
});
test("aggregate merges complete group counts before selecting the global top fifty", async () => {
    const f = fixture();
    const groups = Array.from({ length: 60 }, (_, i) => ({ key: `event:${i}`, count: i + 1 }));
    for (const id of ["instance:a", "instance:b"]) {
        f.overrides.set(id, { aggregate: async () => ({ total: 1830, groups }) });
    }
    const result = await f.service.aggregate({
        ...window,
        instanceIds: ["instance:a", "instance:b"],
        groupBy: "event",
    });
    expect(result.total).toBe(3660);
    expect(result.truncated).toBe(true);
    expect(result.groups).toHaveLength(50);
    expect(result.groups[0]).toEqual({ key: "event:59", count: 120 });
});
