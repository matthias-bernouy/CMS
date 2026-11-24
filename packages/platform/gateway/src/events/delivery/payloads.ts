import type { Db, Collection } from "mongodb";
type Payload = { _id: string; siteId: string; value: string; expiresAt: Date };
/** Payload expiry is independent of delivery and deduplication metadata retention. */
export class MongoEventPayloads {
    private readonly rows: Collection<Payload>;
    constructor(db: Db, name: string) {
        this.rows = db.collection(name, {
            writeConcern: { w: "majority", j: true },
            readConcern: { level: "majority" },
        });
    }
    async init() {
        await this.rows.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }
    async put(siteId: string, id: string, value: string, expiresAt: number) {
        try {
            await this.rows.insertOne({
                _id: JSON.stringify([siteId, id]),
                siteId,
                value,
                expiresAt: new Date(expiresAt),
            });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const previous = await this.rows.findOne(
                { _id: JSON.stringify([siteId, id]), siteId },
                { maxTimeMS: 2000 },
            );
            if (previous?.value !== value) {
                throw new TypeError("Conflicting event payload");
            }
        }
    }
    async get(siteId: string, id: string) {
        const row = await this.rows.findOne({ _id: JSON.stringify([siteId, id]), siteId }, { maxTimeMS: 2000 });
        if (!row || row.expiresAt.getTime() <= Date.now()) {
            return undefined;
        }
        return row.value;
    }
    async remove(siteId: string, id: string) {
        await this.rows.deleteOne({ _id: JSON.stringify([siteId, id]), siteId });
    }
}
