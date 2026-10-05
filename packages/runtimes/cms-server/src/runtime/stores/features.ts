import { MongoIdentityService } from "@bernouy/cms-gateway/identity/mongo";
import type { Db } from "mongodb";

export async function createFeatureStores(db: Db) {
    const identities = new MongoIdentityService(db);
    await identities.init();

    return { identities };
}

export type FeatureStores = Awaited<ReturnType<typeof createFeatureStores>>;
