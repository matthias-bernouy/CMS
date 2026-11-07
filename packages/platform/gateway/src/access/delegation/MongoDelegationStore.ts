import { DELEGATION_LIMITS } from "cms-gateway/access/delegation/limits";
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
        const entry = {
            requestId: record.source.requestId,
            hash: record.hash,
            expiresAt: record.expiresAt,
            record,
            calls: 0,
            bytes: 0,
        };
        const live = {
            $filter: { input: { $ifNull: ["$entries", []] }, as: "entry", cond: { $gt: ["$$entry.expiresAt", now] } },
        };
        const before = await this.rows.findOneAndUpdate(
            { _id: record.siteId },
            [
                {
                    $set: {
                        entries: {
                            $let: {
                                vars: { live },
                                in: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $lt: [{ $size: "$$live" }, DELEGATION_LIMITS.activeTicketsPerSite] },
                                                {
                                                    $not: [
                                                        {
                                                            $in: [
                                                                { $literal: record.hash },
                                                                {
                                                                    $map: {
                                                                        input: "$$live",
                                                                        as: "entry",
                                                                        in: "$$entry.hash",
                                                                    },
                                                                },
                                                            ],
                                                        },
                                                    ],
                                                },
                                            ],
                                        },
                                        { $concatArrays: ["$$live", { $literal: [entry] }] },
                                        "$$live",
                                    ],
                                },
                            },
                        },
                        expiresAt: { $max: ["$expiresAt", { $literal: new Date(record.expiresAt) }] },
                    },
                },
            ],
            { upsert: true, returnDocument: "before", projection: { "entries.hash": 1, "entries.expiresAt": 1 } },
        );
        // The atomic preimage determines exactly whether this operation appended a ticket.
        const previous = before?.entries?.filter((item) => item.expiresAt > now) ?? [];
        return (
            previous.length < DELEGATION_LIMITS.activeTicketsPerSite &&
            !previous.some(({ hash }) => hash === record.hash)
        );
    }
    async get(siteId: string, hash: string, now: number) {
        const row = await this.rows.findOne(
            { _id: siteId },
            { projection: { entries: { $elemMatch: { hash, expiresAt: { $gt: now } } } } },
        );
        return row?.entries?.[0]?.record ?? null;
    }
    async consume(siteId: string, hash: string, now: number, bytes: number) {
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > DELEGATION_LIMITS.requestBytes) {
            return false;
        }
        const result = await this.rows.updateOne(
            {
                _id: siteId,
                entries: {
                    $elemMatch: {
                        hash,
                        expiresAt: { $gt: now },
                        calls: { $lt: DELEGATION_LIMITS.childCalls },
                        bytes: { $lte: DELEGATION_LIMITS.requestBytes - bytes },
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
