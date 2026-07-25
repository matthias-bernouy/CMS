import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import type { SignupLegalAcceptance, SignupLegalAcceptanceStore } from "cms-auth/signup-legal/contracts";

export type MongoSignupLegalAcceptanceConfig = { collectionPrefix?: string };

type SignupLegalAcceptanceDoc = Omit<SignupLegalAcceptance, "id"> & { _id: string };

/**
 * Append-only Mongo store. It intentionally exposes no update or delete
 * method, and one unique proof is retained for each CMS user registration.
 */
export class MongoSignupLegalAcceptanceStore implements SignupLegalAcceptanceStore {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoSignupLegalAcceptanceConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.collection.createIndex({ cmsUserId: 1 }, { unique: true });
        await this.collection.createIndex({ "documents.versionId": 1 });
    }

    async append(acceptance: SignupLegalAcceptance): Promise<void> {
        const { id, ...proof } = acceptance;
        await this.collection.insertOne({ _id: id, ...proof } as OptionalUnlessRequiredId<SignupLegalAcceptanceDoc>);
    }

    async listForUser(cmsUserId: string): Promise<SignupLegalAcceptance[]> {
        const documents = await this.collection.find({ cmsUserId }).sort({ acceptedAt: 1 }).toArray();
        return documents.map(({ _id, ...proof }) => ({ id: _id, ...proof }));
    }

    private get collection(): Collection<SignupLegalAcceptanceDoc> {
        return this.db.collection<SignupLegalAcceptanceDoc>(this.prefix + "signup_legal_acceptances");
    }
}
