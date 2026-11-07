import { expect, test } from "bun:test";
import { CmsObservability } from "@bernouy/cms-observability";
import { PROVIDER_TOKEN } from "../../../ulviaProviderFixture";
import { entry, observabilityFixture } from "./fixture";

test("SDK diagnostic ingestion preserves signed machine authority, redaction and instance isolation", async () => {
    const f = await observabilityFixture();
    try {
        const item = entry();
        const before = { ...f.counts };
        expect(
            (
                await f.call(
                    "logs.append",
                    { entries: [item] },
                    { systemServiceId: null, headers: { "x-ulvia-system-service-id": "cms-edge" } },
                )
            ).status,
        ).toBe(403);
        expect(
            (await f.call("logs.append", { entries: [item] }, { instanceId: "instance:observability-b" })).status,
        ).toBe(401);
        expect((await f.call("logs.append", { entries: [item], instanceId: "instance:observability-b" })).status).toBe(
            400,
        );
        expect(f.counts).toEqual(before);
        expect(await (await f.call("logs.append", { entries: [item] })).json()).toEqual({
            accepted: 1,
            stored: 1,
            duplicates: 0,
        });
        expect(await (await f.call("logs.append", { entries: [item] })).json()).toEqual({
            accepted: 1,
            stored: 0,
            duplicates: 1,
        });
        expect(f.counts.appends).toBe(2);
        const response = await f.call("logs.query", { levels: ["error"], limit: 1 });
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.items[0]).toMatchObject({
            id: item.id,
            instanceId: "instance:observability-a",
            service: "cms-edge",
        });
        expect(result.items[0]).not.toHaveProperty("attributes");
        expect(f.counts.queries).toBe(1);
        expect(f.counts.limit).toBe(1);
        expect(f.counts.loaded).toBe(1);
        const detail = await f.call("logs.get", { id: item.id });
        expect(detail.status).toBe(200);
        const record = await detail.json();
        expect(record.attributes.note).toHaveLength(1024);
        expect(JSON.stringify(record)).not.toContain("never-store-me");
        const aggregate = await f.call("logs.aggregate", { groupBy: "level" });
        expect(aggregate.status).toBe(200);
        expect(await aggregate.json()).toMatchObject({
            total: 1,
            groups: [{ key: "error", count: 1 }],
            truncated: false,
        });
        expect(f.counts.aggregates).toBe(1);
        expect(f.counts.queries).toBe(1);
        const other = new CmsObservability({
            store: f.backing,
            instanceId: "instance:observability-b",
            cursorKey: PROVIDER_TOKEN,
        });
        expect((await other.query({})).items).toEqual([]);
    } finally {
        f.close();
    }
});

test("diagnostic conflicts and invalid reads preserve records and map only declared errors", async () => {
    const f = await observabilityFixture();
    try {
        const item = entry();
        await f.call("logs.append", { entries: [item] });
        const conflict = await f.call("logs.append", { entries: [{ ...item, event: "changed.event" }] });
        expect(conflict.status).toBe(409);
        expect((await f.journal.get({ id: item.id })).event).toBe(item.event);
        const before = { ...f.counts };
        expect((await f.call("logs.append", { entries: [] })).status).toBe(400);
        expect((await f.call("logs.query", { limit: 201 })).status).toBe(400);
        expect((await f.call("logs.aggregate", { groupBy: "raw-body" })).status).toBe(400);
        const invalid = await f.call("logs.query", { cursor: "private-malformed-cursor" });
        expect(invalid.status).toBe(422);
        expect(await invalid.text()).not.toContain("private-malformed-cursor");
        expect(f.counts).toEqual(before);
        expect((await f.call("logs.get", { id: crypto.randomUUID() })).status).toBe(404);
    } finally {
        f.close();
    }
});
