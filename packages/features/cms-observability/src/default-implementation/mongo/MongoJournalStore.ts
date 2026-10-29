import { MongoBulkWriteError, type Db } from "mongodb";
import type {
    JournalPosition,
    JournalStore,
    LogGroup,
    NormalizedLogQuery,
    StoredLogEntry,
} from "cms-observability/interfaces/Journal";
import { ObservabilityError } from "cms-observability/core/validation";
import { fromDocument, mongoFilter, type JournalDocument } from "./filter";

export class MongoJournalStore implements JournalStore {
    private readonly entries;

    constructor(db: Db) {
        this.entries = db.collection<JournalDocument>("cms_observability_entries");
    }

    async init(): Promise<void> {
        await this.entries.createIndex({ instanceId: 1, id: 1 }, { unique: true });
        await this.entries.createIndex({ instanceId: 1, receivedAt: -1, id: -1 });
        for (const field of [
            "level",
            "service",
            "event",
            "requestId",
            "traceId",
            "parentInvocationId",
            "contractId",
            "capabilityId",
        ]) {
            await this.entries.createIndex({ instanceId: 1, [field]: 1, time: -1 });
        }
        await this.entries.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }

    async append(entries: readonly StoredLogEntry[]) {
        if (!entries.length) {
            return { stored: 0, duplicates: 0 };
        }
        const unique = new Map<string, StoredLogEntry>();
        for (const entry of entries) {
            const key = JSON.stringify([entry.instanceId, entry.id]);
            const previous = unique.get(key);
            if (previous && previous.fingerprint !== entry.fingerprint) {
                throw new ObservabilityError("ENTRY_CONFLICT");
            }
            unique.set(key, entry);
        }
        const rows = [...unique.values()];
        const operations = rows.map(({ expiresAt, ...entry }) => ({
            updateOne: {
                // The unique (instanceId, id) index rejects a conflicting fingerprint.
                filter: { instanceId: entry.instanceId, id: entry.id, fingerprint: entry.fingerprint },
                update: { $setOnInsert: { ...entry, expiresAt: new Date(expiresAt) } },
                upsert: true,
            },
        }));
        let stored: number;
        try {
            const result = await this.entries.bulkWrite(operations, {
                ordered: false,
                writeConcern: { w: "majority" },
            });
            stored = result.upsertedCount;
        } catch (error) {
            if (
                !(error instanceof MongoBulkWriteError) ||
                error.err ||
                error.result.getWriteConcernError() ||
                !Array.isArray(error.writeErrors) ||
                !error.writeErrors.length ||
                error.writeErrors.some((item) => item.code !== 11000)
            ) {
                throw error;
            }
            // A concurrent equal upsert can race the unique index. Verify all failed IDs in one bounded read.
            const failed = error.writeErrors.map((item) => rows[item.index]!);
            const previous = await this.entries
                .find(
                    { $or: failed.map(({ instanceId, id }) => ({ instanceId, id })) },
                    { projection: { instanceId: 1, id: 1, fingerprint: 1 }, readConcern: { level: "majority" } },
                )
                .toArray();
            const fingerprints = new Map(
                previous.map((row) => [JSON.stringify([row.instanceId, row.id]), row.fingerprint]),
            );
            if (failed.some((row) => fingerprints.get(JSON.stringify([row.instanceId, row.id])) !== row.fingerprint)) {
                throw new ObservabilityError("ENTRY_CONFLICT");
            }
            stored = error.result.upsertedCount;
        }
        return { stored, duplicates: entries.length - stored };
    }

    async query(instanceId: string, query: NormalizedLogQuery, now: string, after?: JournalPosition) {
        const rows = await this.entries
            .find(mongoFilter(instanceId, query, now, after), { maxTimeMS: 2000 })
            .sort({ receivedAt: -1, id: -1 })
            .limit(query.limit + 1)
            .toArray();
        return rows.map(fromDocument);
    }

    async get(instanceId: string, id: string, now: string) {
        const row = await this.entries.findOne(
            { instanceId, id, expiresAt: { $gt: new Date(now) } },
            { maxTimeMS: 2000 },
        );
        return row ? fromDocument(row) : null;
    }

    async aggregate(instanceId: string, query: NormalizedLogQuery, groupBy: LogGroup, now: string) {
        const [result] = await this.entries
            .aggregate<{ totals: { count: number }[]; groups: { key: string; count: number }[] }>(
                [
                    { $match: mongoFilter(instanceId, query, now) },
                    {
                        $facet: {
                            totals: [{ $count: "count" }],
                            groups: [
                                { $group: { _id: { $ifNull: [`$${groupBy}`, "unknown"] }, count: { $sum: 1 } } },
                                { $sort: { count: -1, _id: 1 } },
                                { $limit: 51 },
                                { $project: { _id: 0, key: "$_id", count: 1 } },
                            ],
                        },
                    },
                ],
                { maxTimeMS: 2000 },
            )
            .toArray();
        return {
            total: result?.totals[0]?.count ?? 0,
            groups: result?.groups.slice(0, 50) ?? [],
            truncated: (result?.groups.length ?? 0) > 50,
        };
    }
}
