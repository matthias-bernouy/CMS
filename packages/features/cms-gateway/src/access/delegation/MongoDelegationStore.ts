import type { Collection, Db } from "mongodb";
import type { DelegationRecord, DelegationStore } from "./interfaces";

type Entry = {
    requestId: string;
    hash: string;
    expiresAt: number;
    calls: number;
    bytes: number;
    record: DelegationRecord;
};
type Row = { _id: string; entries: Entry[]; expiresAt: Date };
/** One bounded atomic bucket per instance; TTL is cleanup, never an authorization check. */
export class MongoDelegationStore implements DelegationStore {
    private readonly rows: Collection<Row>;
    constructor(db: Db) {
        this.rows = db.collection<Row>("gateway_delegations");
    }
    async init() {
        await this.rows.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }
    async create(record: DelegationRecord, now: number) {
        await this.rows.updateOne(
            { _id: record.siteId },
            { $setOnInsert: { entries: [], expiresAt: new Date(now + 30_000) } },
            { upsert: true },
        );
        await this.rows.updateOne({ _id: record.siteId }, { $pull: { entries: { expiresAt: { $lte: now } } } });
        const result = await this.rows.updateOne(
            { _id: record.siteId, "entries.hash": { $ne: record.hash }, $expr: { $lt: [{ $size: "$entries" }, 256] } },
            {
                $push: {
                    entries: {
                        requestId: record.source.requestId,
                        hash: record.hash,
                        expiresAt: record.expiresAt,
                        record,
                        calls: 0,
                        bytes: 0,
                    },
                },
                $max: { expiresAt: new Date(record.expiresAt) },
            },
        );
        return result.modifiedCount === 1;
    }
    async get(siteId: string, hash: string, now: number) {
        const row = await this.rows.findOne(
            { _id: siteId },
            { projection: { entries: { $elemMatch: { hash, expiresAt: { $gt: now } } } } },
        );
        return row?.entries?.[0]?.record ?? null;
    }
    async consume(siteId: string, hash: string, now: number, bytes: number) {
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 4 * 1024 * 1024) {
            return false;
        }
        const result = await this.rows.updateOne(
            {
                _id: siteId,
                entries: {
                    $elemMatch: {
                        hash,
                        expiresAt: { $gt: now },
                        calls: { $lt: 32 },
                        bytes: { $lte: 4 * 1024 * 1024 - bytes },
                    },
                },
            },
            { $inc: { "entries.$.calls": 1, "entries.$.bytes": bytes } },
        );
        return result.modifiedCount === 1;
    }
    async close(siteId: string, hash: string, requestId: string) {
        await this.rows.updateOne(
            { _id: siteId },
            { $pull: { entries: { hash: { $eq: hash }, requestId: { $eq: requestId } } } },
        );
    }
}
