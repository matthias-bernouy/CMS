import type { Collection, IndexDescription } from "mongodb";

import type { AccessMetric, ProcessedLogFile } from "../../interfaces/entities/AccessMetric";
import type {
    AccessMetricsRepository,
    BucketBytes,
    DateRange,
    EdgeBytes,
    MetricDelta,
} from "../../interfaces/repositories/AccessMetricsRepository";

export type AccessMetricDocument    = Omit<AccessMetric,    "id"> & { _id: string };
export type ProcessedLogFileDocument = Omit<ProcessedLogFile, "id"> & { _id: string };

/**
 * Mongo-backed `AccessMetricsRepository`. Two collections:
 * - `cdn_access_metrics`        — daily aggregates, `_id = edge:bucket:day`.
 * - `cdn_access_metrics_files`  — processed `.gz` markers, `_id = edge:filename`.
 */
export class MongoAccessMetricsRepository implements AccessMetricsRepository {

    private _ready: Promise<void> | null;

    constructor(
        private readonly _metrics: Collection<AccessMetricDocument>,
        private readonly _files:   Collection<ProcessedLogFileDocument>,
    ) {
        this._ready = this._ensureIndexes().catch((e) => { this._ready = null; throw e; });
    }

    private async _ensureIndexes(): Promise<void> {
        const metricIdx: IndexDescription[] = [
            { key: { day: 1, bytes: -1 },              name: "day_bytes" },
            { key: { edgeId: 1, day: 1 },              name: "edge_day"  },
            { key: { bucketId: 1, day: 1 },            name: "bucket_day" },
        ];
        await Promise.all([
            this._metrics.createIndexes(metricIdx),
            this._files.createIndexes([{ key: { edgeId: 1, processedAt: -1 }, name: "edge_processedAt" }]),
        ]);
    }

    private async _wait(): Promise<void> { if (this._ready) await this._ready; }

    async incrementMetric(key: { edgeId: string; bucketId: string; day: string }, delta: MetricDelta): Promise<void> {
        await this._wait();
        const _id = `${key.edgeId}:${key.bucketId}:${key.day}`;
        await this._metrics.updateOne(
            { _id },
            {
                $setOnInsert: { edgeId: key.edgeId, bucketId: key.bucketId, day: key.day },
                $set:         { updatedAt: Date.now() },
                $inc:         { ...delta },
            },
            { upsert: true },
        );
    }

    async topBucketsByBytes(range: DateRange, limit: number): Promise<BucketBytes[]> {
        await this._wait();
        const docs = await this._metrics.aggregate<{ _id: string; bytes: number; requests: number }>([
            { $match: { day: { $gte: range.from, $lte: range.to } } },
            { $group: { _id: "$bucketId", bytes: { $sum: "$bytes" }, requests: { $sum: "$requests" } } },
            { $sort:  { bytes: -1 } },
            { $limit: limit },
        ]).toArray();
        return docs.map((d) => ({ bucketId: d._id, bytes: d.bytes, requests: d.requests }));
    }

    async bytesByEdge(range: DateRange): Promise<EdgeBytes[]> {
        await this._wait();
        const docs = await this._metrics.aggregate<{ _id: string; bytes: number; requests: number }>([
            { $match: { day: { $gte: range.from, $lte: range.to } } },
            { $group: { _id: "$edgeId",   bytes: { $sum: "$bytes" }, requests: { $sum: "$requests" } } },
            { $sort:  { bytes: -1 } },
        ]).toArray();
        return docs.map((d) => ({ edgeId: d._id, bytes: d.bytes, requests: d.requests }));
    }

    async listRange(range: DateRange, edgeId?: string): Promise<AccessMetric[]> {
        await this._wait();
        const filter: Record<string, unknown> = { day: { $gte: range.from, $lte: range.to } };
        if (edgeId) filter.edgeId = edgeId;
        const docs = await this._metrics.find(filter).toArray();
        return docs.map((d) => ({ id: d._id, ...rest(d) }));
    }

    async isFileProcessed(edgeId: string, filename: string): Promise<boolean> {
        await this._wait();
        const doc = await this._files.findOne({ _id: `${edgeId}:${filename}` });
        return doc !== null;
    }

    async markFileProcessed(file: ProcessedLogFile): Promise<void> {
        await this._wait();
        await this._files.updateOne(
            { _id: file.id },
            { $set: { edgeId: file.edgeId, filename: file.filename, processedAt: file.processedAt, lineCount: file.lineCount, bytesProcessed: file.bytesProcessed } },
            { upsert: true },
        );
    }
}

function rest(d: AccessMetricDocument): Omit<AccessMetric, "id"> {
    const { _id: _, ...r } = d;
    return r;
}
