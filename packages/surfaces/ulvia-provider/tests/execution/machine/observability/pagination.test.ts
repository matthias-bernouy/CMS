import { expect, test } from "bun:test";
import { entry, observabilityFixture } from "./fixture";

test("diagnostic cursor pages use one bounded store query and refuse foreign or changed continuations before reads", async () => {
    const f = await observabilityFixture();
    const other = await observabilityFixture(f.backing, "instance:observability-b");
    try {
        const batch = [entry(), entry(), entry()];
        expect((await f.call("logs.append", { entries: batch })).status).toBe(200);
        const first = await (await f.call("logs.query", { limit: 1 })).json();
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).toBeString();
        expect(f.counts.queries).toBe(1);
        expect(f.counts.limit).toBe(1);
        expect(f.counts.loaded).toBe(2);
        const before = { ...f.counts };
        expect(
            (await f.call("logs.query", { limit: 1, cursor: first.nextCursor, event: "changed.event" })).status,
        ).toBe(422);
        expect(f.counts).toEqual(before);
        expect((await other.call("logs.query", { limit: 1, cursor: first.nextCursor })).status).toBe(422);
        expect(other.counts.queries).toBe(0);
        const second = await (await f.call("logs.query", { limit: 1, cursor: first.nextCursor })).json();
        expect(second.items).toHaveLength(1);
        expect(second.items[0].id).not.toBe(first.items[0].id);
        expect(f.counts.queries).toBe(2);
        expect(f.counts.loaded).toBe(4);
        const third = await (await f.call("logs.query", { limit: 1, cursor: second.nextCursor })).json();
        expect(third.items).toHaveLength(1);
        expect(third.nextCursor).toBeNull();
        expect(new Set([...first.items, ...second.items, ...third.items].map((row) => row.id)).size).toBe(3);
        expect(f.counts.queries).toBe(3);
        expect(f.counts.loaded).toBe(5);
    } finally {
        f.close();
        other.close();
    }
});
