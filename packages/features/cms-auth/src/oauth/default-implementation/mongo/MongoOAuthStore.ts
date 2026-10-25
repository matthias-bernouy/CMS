import type { Db } from "mongodb";
import type { OAuthRecord, OAuthStore } from "../../interfaces/OAuthStore";

type Document = OAuthRecord & { _id: string; expiration: Date };

export class MongoOAuthStore implements OAuthStore {
    private readonly collection;
    constructor(db: Db) {
        this.collection = db.collection<Document>("cms_oauth_records");
    }
    async init() {
        await this.collection.createIndex({ expiration: 1 }, { expireAfterSeconds: 0 });
    }
    async get(id: string) {
        return this.collection.findOne({ _id: id });
    }
    async create(record: OAuthRecord) {
        await this.collection.insertOne({ ...record, _id: record.id, expiration: new Date(record.expiresAt) });
    }
    async replace(record: OAuthRecord, expectedRevision: number) {
        return (
            (
                await this.collection.replaceOne(
                    { _id: record.id, revision: expectedRevision },
                    { ...record, expiration: new Date(record.expiresAt) },
                )
            ).modifiedCount === 1
        );
    }
    async pruneExpired(now: number) {
        await this.collection.deleteMany({ expiresAt: { $lte: now } });
    }
    async list(
        prefix: string,
        limit: number,
        subjectId?: string,
        options: { after?: string; expiresAfter?: number } = {},
    ) {
        return this.collection
            .find({
                _id: { ...(options.after ? { $gt: options.after } : { $gte: prefix }), $lt: `${prefix}\uffff` },
                ...(options.expiresAfter === undefined ? {} : { expiresAt: { $gt: options.expiresAfter } }),
                ...(subjectId ? { "value.subjectId": subjectId } : {}),
            })
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
    }
}
