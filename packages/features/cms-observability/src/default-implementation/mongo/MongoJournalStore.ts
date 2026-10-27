import type { Db } from "mongodb";
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
        for (const field of ["level", "service", "event", "requestId", "contractId", "capabilityId"]) {
            await this.entries.createIndex({ instanceId: 1, [field]: 1, time: -1 });
        }
        await this.entries.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }

    async append(entries: readonly StoredLogEntry[]) {
        let stored = 0;
        let duplicates = 0;
        for (const entry of entries) {
            const { expiresAt, ...rest } = entry;
            const filter = { instanceId: entry.instanceId, id: entry.id };
            try {
                const result = await this.entries.updateOne(
                    filter,
                    { $setOnInsert: { ...rest, expiresAt: new Date(expiresAt) } },
                    { upsert: true, writeConcern: { w: "majority" } },
                );
                if (result.upsertedCount) {
                    stored += 1;
                    continue;
                }
            } catch (error) {
                if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) {
                    throw error;
                }
            }
            const previous = await this.entries.findOne(filter, { projection: { fingerprint: 1 } });
            if (!previous || previous.fingerprint !== entry.fingerprint) {
                throw new ObservabilityError("ENTRY_CONFLICT");
            }
            duplicates += 1;
        }
        return { stored, duplicates };
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
