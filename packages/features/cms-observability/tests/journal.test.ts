import { expect, test } from "bun:test";
import { CmsObservability } from "@bernouy/cms-observability";
import { InMemoryJournalStore } from "@bernouy/cms-observability/memory";

const key = "private-cursor-key-that-is-at-least-32-characters";
let clock = new Date("2026-10-26T12:00:00.000Z");
const entry = (overrides = {}) => ({
    id: crypto.randomUUID(),
    time: "2026-10-26T11:00:00.000Z",
    level: "error",
    event: "page.render.failed",
    attributes: {},
    ...overrides,
});
function fixture() {
    clock = new Date("2026-10-26T12:00:00.000Z");
    const store = new InMemoryJournalStore();
    return {
        a: new CmsObservability({ store, instanceId: "instance-a", cursorKey: key, now: () => clock }),
        b: new CmsObservability({ store, instanceId: "instance-b", cursorKey: key, now: () => clock }),
    };
}

test("instance authority and service identity cannot be supplied in ingestion or search input", async () => {
    const { a, b } = fixture();
    const item = entry();
    await a.append({ entries: [item] }, "cms-edge");
    expect((await a.get({ id: item.id })).instanceId).toBe("instance-a");
    expect((await b.query({})).items).toEqual([]);
    await expect(b.get({ id: item.id })).rejects.toThrow("NOT_FOUND");
    await expect(a.append({ entries: [item], instanceId: "instance-b" }, "cms-edge")).rejects.toThrow("INVALID_INPUT");
    await expect(a.append({ entries: [{ ...item, service: "other" }] }, "cms-edge")).rejects.toThrow("INVALID_INPUT");
    await expect(a.query({ instanceId: "instance-b" })).rejects.toThrow("INVALID_INPUT");
});

test("acknowledged retries preserve IDs, reject conflicting reuse and redact at reception", async () => {
    const { a } = fixture();
    const item = entry({ attributes: { password: "never-store-this", operation: "read" } });
    expect(await a.append({ entries: [item] }, "cms-edge")).toEqual({ accepted: 1, stored: 1, duplicates: 0 });
    expect(await a.append({ entries: [item] }, "cms-edge")).toEqual({ accepted: 1, stored: 0, duplicates: 1 });
    expect((await a.get({ id: item.id })).attributes.password).toBe("[REDACTED]");
    await expect(a.append({ entries: [{ ...item, event: "other.failed" }] }, "cms-edge")).rejects.toThrow(
        "ENTRY_CONFLICT",
    );
    await expect(a.append({ entries: [item] }, "ulvia-provider")).rejects.toThrow("ENTRY_CONFLICT");
});

test("filters, summaries, detail and aggregation share the retained instance window", async () => {
    const { a } = fixture();
    const failed = entry({
        component: "pages",
        contractId: "ulvia.cms.content",
        capabilityId: "pages.get",
        requestId: "request-a",
        durationMs: 15,
    });
    await a.append(
        {
            entries: [
                failed,
                entry({ level: "info", event: "page.render.completed" }),
                entry({ time: "2026-10-24T11:00:00.000Z" }),
            ],
        },
        "cms-edge",
    );
    await a.append({ entries: [entry({ level: "warn" })] }, "ulvia-provider");
    const result = await a.query({
        levels: ["error"],
        service: "cms-edge",
        component: "pages",
        eventPrefix: "page.",
        contractId: "ulvia.cms.content",
        requestId: "request-a",
    });
    expect(result.items.map(({ id }) => id)).toEqual([failed.id]);
    expect(result.items[0]).not.toHaveProperty("attributes");
    expect(result.items[0]).not.toHaveProperty("fingerprint");
    expect((await a.get({ id: failed.id })).durationMs).toBe(15);
    expect(await a.aggregate({ groupBy: "level" })).toEqual({
        total: 3,
        groups: [
            { key: "error", count: 1 },
            { key: "info", count: 1 },
            { key: "warn", count: 1 },
        ],
        truncated: false,
    });
    expect((await a.query({ minLevel: "warn" })).items).toHaveLength(2);
    expect((await a.query({ eventPrefix: ".*" })).items).toEqual([]);
});

test("pagination disambiguates equal reception timestamps and binds cursor to filters, expiry and instance", async () => {
    const { a, b } = fixture();
    await a.append({ entries: Array.from({ length: 5 }, () => entry()) }, "cms-edge");
    const first = await a.query({ limit: 2 });
    clock = new Date("2026-10-26T12:00:01.000Z");
    const second = await a.query({ limit: 2, cursor: first.nextCursor! });
    const third = await a.query({ limit: 2, cursor: second.nextCursor! });
    expect(new Set([...first.items, ...second.items, ...third.items].map(({ id }) => id)).size).toBe(5);
    expect(third.nextCursor).toBeNull();
    await expect(b.query({ limit: 2, cursor: first.nextCursor! })).rejects.toThrow("INVALID_CURSOR");
    await expect(a.query({ limit: 2, timeField: "receivedAt", cursor: first.nextCursor! })).rejects.toThrow(
        "INVALID_CURSOR",
    );
    await expect(a.query({ limit: 2, levels: ["warn"], cursor: first.nextCursor! })).rejects.toThrow("INVALID_CURSOR");
    await expect(a.query({ limit: 2, cursor: first.nextCursor!.slice(0, -2) + "xx" })).rejects.toThrow(
        "INVALID_CURSOR",
    );
    clock = new Date("2026-10-26T12:16:00.000Z");
    await expect(a.query({ limit: 2, cursor: first.nextCursor! })).rejects.toThrow("INVALID_CURSOR");
});

test("retention is enforced during reads even before physical TTL cleanup", async () => {
    const { a } = fixture();
    const item = entry();
    await a.append({ entries: [item] }, "cms-edge");
    clock = new Date("2026-11-10T12:00:00.000Z");
    expect((await a.query({ from: "2026-10-25T00:00:00.000Z", to: clock.toISOString() })).items).toEqual([]);
    expect((await a.aggregate({ groupBy: "service", from: "2026-10-25T00:00:00.000Z" })).total).toBe(0);
    await expect(a.get({ id: item.id })).rejects.toThrow("NOT_FOUND");
});

test("ingestion and search reject unbounded inputs before writing", async () => {
    const { a } = fixture();
    for (const entries of [
        [],
        Array.from({ length: 51 }, () => entry()),
        [entry({ attributes: { nested: {} } })],
        [entry({ durationMs: -1 })],
        [entry({ time: "2027-01-01T00:00:00.000Z" })],
    ]) {
        await expect(a.append({ entries }, "cms-edge")).rejects.toThrow("INVALID_INPUT");
    }
    for (const query of [
        { limit: 201 },
        { timeField: "unknown" },
        { limit: -1 },
        { levels: ["invalid"] },
        { minLevel: "invalid" },
        { from: "2020-01-01T00:00:00.000Z" },
        { event: { $regex: ".*" } },
    ]) {
        await expect(a.query(query)).rejects.toThrow("INVALID_INPUT");
    }
    expect((await a.query({})).items).toEqual([]);
});

test("Provider entry IDs are isolated by authenticated emitter and instance, including retries", async () => {
    const { a, b } = fixture();
    const item = entry();
    expect(await a.append({ entries: [item] }, "provider:source-a")).toMatchObject({ stored: 1 });
    expect(await a.append({ entries: [item] }, "provider:source-a")).toMatchObject({ duplicates: 1 });
    expect(await a.append({ entries: [item] }, "provider:source-b")).toMatchObject({ stored: 1 });
    const query = await a.query({});
    expect(new Set(query.items.map(({ id }) => id)).size).toBe(2);
    for (const row of query.items) {
        expect(row.id).not.toBe(item.id);
        expect(await a.get({ id: row.id })).toMatchObject({ sourceEntryId: item.id, instanceId: "instance-a" });
        await expect(b.get({ id: row.id })).rejects.toThrow("NOT_FOUND");
    }
    await b.append({ entries: [item] }, "provider:source-a");
    expect((await b.query({})).items).toHaveLength(1);
    await expect(a.append({ entries: [{ ...item, event: "changed" }] }, "provider:source-a")).rejects.toThrow(
        "ENTRY_CONFLICT",
    );
});

test("trace and parent filters stay bound to the instance and return independent span records", async () => {
    const { a, b } = fixture();
    const traceId = crypto.randomUUID();
    const parentInvocationId = crypto.randomUUID();
    await a.append(
        {
            entries: [
                entry({ traceId, invocationId: crypto.randomUUID(), parentInvocationId }),
                entry({ traceId: crypto.randomUUID() }),
            ],
        },
        "cms-edge",
    );
    expect((await a.query({ traceId })).items).toHaveLength(1);
    expect((await a.query({ traceId, parentInvocationId })).items[0]).toMatchObject({ traceId, parentInvocationId });
    expect((await a.query({ traceId, parentInvocationId: crypto.randomUUID() })).items).toHaveLength(0);
    expect((await b.query({ traceId })).items).toHaveLength(0);
});
