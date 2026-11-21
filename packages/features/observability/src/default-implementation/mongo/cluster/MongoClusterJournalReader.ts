import type { Db } from "mongodb";
import type { LogSummary, NormalizedLogQuery } from "observability/interfaces/Journal";
import type {
    ClusterAggregate,
    ClusterJournalReader,
    ClusterPosition,
    LatencyHistogram,
    LatencyQuery,
} from "observability/cluster/interfaces/ClusterJournal";
import { ClusterSourceError } from "observability/cluster/core/errors";
import { detail } from "observability/core/projections";
import { MongoJournalStore } from "../MongoJournalStore";
import { mongoFilter } from "../filter";
import type { JournalDocument } from "../filter";
import { latencyPipeline } from "./latencyPipeline";

/** Read existing journals without initializing indexes, hydrating a tenant or writing metadata. */
export class MongoClusterJournalReader implements ClusterJournalReader {
    private readonly entries;
    private readonly store;
    constructor(
        db: Db,
        private readonly instanceId: string,
    ) {
        this.entries = db.collection<JournalDocument>("cms_observability_entries");
        this.store = new MongoJournalStore(db);
    }
    async query(query: NormalizedLogQuery, now: string, after?: ClusterPosition) {
        const filter = mongoFilter(this.instanceId, query, now, after);
        if (after && this.instanceId < after.instanceId) {
            filter.$or = [
                { receivedAt: { $lt: after.receivedAt } },
                { receivedAt: after.receivedAt, id: { $lte: after.id } },
            ];
        }
        return this.entries
            .find<LogSummary>(filter, {
                projection: { _id: 0, attributes: 0, error: 0, expiresAt: 0, fingerprint: 0 },
                maxTimeMS: 2000,
            })
            .sort({ receivedAt: -1, id: -1 })
            .limit(query.limit + 1)
            .toArray();
    }
    async get(id: string, now: string) {
        const row = await this.store.get(this.instanceId, id, now);
        return row ? detail(row) : null;
    }
    async aggregate(query: NormalizedLogQuery, groupBy: ClusterAggregate["groupBy"], now: string) {
        const groups = await this.entries
            .aggregate<{ key: string; count: number }>(
                [
                    { $match: mongoFilter(this.instanceId, query, now) },
                    { $group: { _id: { $ifNull: [`$${groupBy}`, "unknown"] }, count: { $sum: 1 } } },
                    { $limit: 501 },
                    { $project: { _id: 0, key: "$_id", count: 1 } },
                ],
                { maxTimeMS: 2000, allowDiskUse: false },
            )
            .toArray();
        if (groups.length > 500) {
            throw new ClusterSourceError("limit_exceeded");
        }
        return { groups, total: groups.reduce((sum, row) => sum + row.count, 0) };
    }
    async latency(query: NormalizedLogQuery, groupBy: LatencyQuery["groupBy"], intervalSeconds: number, now: string) {
        const rows = await this.entries
            .aggregate<LatencyHistogram>(
                [
                    { $match: mongoFilter(this.instanceId, query, now) },
                    ...latencyPipeline(groupBy, intervalSeconds, query.timeField ?? "time"),
                ],
                { maxTimeMS: 2000, allowDiskUse: false },
            )
            .toArray();
        if (rows.length > 500) {
            throw new ClusterSourceError("limit_exceeded");
        }
        return rows;
    }
}
