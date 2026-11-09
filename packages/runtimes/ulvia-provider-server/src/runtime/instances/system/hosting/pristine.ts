import type { Db } from "mongodb";

/** Startup-only emptiness proof; never scan collections on the request serving path. */
export async function isPristineHostingDatabase(db: Db): Promise<boolean> {
    const collections = db.listCollections({}, { nameOnly: true, batchSize: 16 });
    let inspected = 0;
    try {
        for await (const collection of collections) {
            if (++inspected > 32 || (await db.collection(collection.name).findOne({}, { projection: { _id: 1 } }))) {
                return false;
            }
        }
        return true;
    } finally {
        await collections.close();
    }
}
