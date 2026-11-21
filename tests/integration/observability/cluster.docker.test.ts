import { expect, test } from "bun:test";
import { CmsObservability } from "@bernouy/observability";
import { ClusterLogs } from "@bernouy/observability/cluster";
import { MongoJournalStore, MongoClusterJournalReader } from "@bernouy/observability/mongo";
import { contentMongo } from "../content/mongo";

const enabled = process.env.ULVIA_RUN_CLUSTER_LOGS_MONGO === "1";
test.skipIf(!enabled)(
    "Mongo federates existing journals read-only, paginates collisions and merges weighted latency populations",
    async () => {
        const fixture = await contentMongo();
        try {
            const now = new Date("2026-11-21T11:00:00.000Z");
            const from = "2026-11-21T10:00:00.000Z";
            const to = now.toISOString();
            const ids = ["instance:a", "instance:b"];
            const key = "mongo-cluster-test-cursor-secret-at-least-32-characters";
            for (const [index, id] of ids.entries()) {
                const db = fixture.client.db(`cluster_journal_${index}`);
                const store = new MongoJournalStore(db);
                await store.init();
                const journal = new CmsObservability({ store, instanceId: id, cursorKey: key, now: () => now });
                const entries = Array.from({ length: index === 0 ? 99 : 1 }, (_, n) => ({
                    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
                    time: "2026-11-21T10:30:00.000Z",
                    level: "info",
                    event: "gateway.invocation.completed",
                    contractId: "ulvia/cms.content",
                    capabilityId: "pages.get",
                    durationMs: index === 0 ? 10 : 10000,
                    attributes: { password: "never-store-this" },
                }));
                for (let start = 0; start < entries.length; start += 50) {
                    await journal.append({ entries: entries.slice(start, start + 50) }, "cms-edge");
                }
                // Expired and foreign-instance entries must not contribute to reads or latency.
                await db.collection("cms_observability_entries").insertMany([
                    {
                        ...entries[0],
                        id: crypto.randomUUID(),
                        instanceId: id,
                        service: "cms-edge",
                        receivedAt: to,
                        expiresAt: new Date("2026-11-20T00:00:00.000Z"),
                    },
                    {
                        ...entries[0],
                        id: crypto.randomUUID(),
                        instanceId: "instance:foreign",
                        service: "cms-edge",
                        receivedAt: to,
                        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
                    },
                ]);
            }
            let queries = 0;
            let aggregates = 0;
            const writes: string[] = [];
            const watch = (event: { commandName: string }) => {
                if (["insert", "update", "delete", "create", "createIndexes"].includes(event.commandName)) {
                    writes.push(event.commandName);
                }
                if (event.commandName === "find") {
                    queries++;
                }
                if (event.commandName === "aggregate") {
                    aggregates++;
                }
            };
            fixture.client.on("commandStarted", watch);
            const service = new ClusterLogs({
                directory: {
                    open: async (id) =>
                        new MongoClusterJournalReader(fixture.client.db(`cluster_journal_${ids.indexOf(id)}`), id),
                },
                cursorKey: key,
                scopeId: "mongo-test",
                now: () => now,
            });
            const selection = { instanceIds: ids, from, to };
            const seen = new Set<string>();
            let cursor: string | undefined;
            do {
                const page = await service.query({ ...selection, limit: 17, cursor });
                expect(page.partial).toBe(false);
                expect(page.items.length).toBeLessThanOrEqual(17);
                for (const item of page.items) {
                    const identity = `${item.instanceId}/${item.id}`;
                    expect(seen.has(identity)).toBe(false);
                    seen.add(identity);
                    expect(item).not.toHaveProperty("attributes");
                    expect(item).not.toHaveProperty("fingerprint");
                }
                cursor = page.nextCursor ?? undefined;
            } while (cursor);
            expect(seen.size).toBe(100);
            expect(queries).toBe(12);
            const latency = await service.latency({
                ...selection,
                event: "gateway.invocation.completed",
                service: "cms-edge",
                groupBy: "capabilityId",
                intervalSeconds: 3600,
            });
            expect(latency.partial).toBe(false);
            expect(latency.points[0]).toMatchObject({ count: 100, meanMs: 109.9, minMs: 10, maxMs: 10000 });
            expect(latency.points[0]!.p95Ms).toBeGreaterThanOrEqual(10);
            expect(latency.points[0]!.p95Ms).toBeLessThanOrEqual(11);
            const aggregate = await service.aggregate({ ...selection, groupBy: "instanceId" });
            expect(aggregate.total).toBe(100);
            expect(aggregate.groups).toEqual([
                { key: "instance:a", count: 99 },
                { key: "instance:b", count: 1 },
            ]);
            expect(aggregates).toBe(4);
            const detail = await service.get({ instanceId: ids[0]!, id: "00000000-0000-4000-8000-000000000000" });
            expect(detail.entry?.attributes.password).toBe("[REDACTED]");
            expect(writes).toEqual([]);
            fixture.client.off("commandStarted", watch);
        } finally {
            await fixture.close();
        }
    },
    60000,
);
