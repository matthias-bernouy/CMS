import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import { sameSignupLegalAcceptancePayload } from "cms-auth/signup-legal/acceptanceIdentity";
import type { SignupLegalAcceptance, SignupLegalAcceptanceStore } from "cms-auth/signup-legal/contracts";

export type MongoSignupLegalAcceptanceConfig = { collectionPrefix?: string };

type SignupLegalAcceptanceDoc = Omit<SignupLegalAcceptance, "id"> & { _id: string };

/**
 * Append-only Mongo store. It intentionally exposes no update or delete
 * method. Deterministic event ids make exact retries idempotent while allowing
 * later legal-document version events for the same CMS user.
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
        await this.collection.createIndex({ "documents.versionId": 1 });
        const indexes = await this.collection.listIndexes().toArray();
        const userIndexes = indexes.filter((index) => isUserIndex(index.key));
        for (const index of userIndexes) {
            if (index.unique === true && index.name) {
                try {
                    await this.collection.dropIndex(index.name);
                } catch (error) {
                    if (!isIndexNotFoundError(error)) {
                        throw error;
                    }
                }
            }
        }
        if (!userIndexes.some((index) => index.unique !== true)) {
            await this.collection.createIndex({ cmsUserId: 1 });
        }
    }

    async append(acceptance: SignupLegalAcceptance): Promise<void> {
        const { id, ...proof } = acceptance;
        try {
            await this.collection.insertOne({
                _id: id,
                ...proof,
            } as OptionalUnlessRequiredId<SignupLegalAcceptanceDoc>);
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
            const existing = await this.collection.findOne({ _id: id });
            if (existing && sameSignupLegalAcceptancePayload({ id: existing._id, ...existing }, acceptance)) {
                return;
            }
            throw new Error("Signup legal acceptance id conflicts with different immutable evidence.", {
                cause: error,
            });
        }
    }

    async listForUser(cmsUserId: string): Promise<SignupLegalAcceptance[]> {
        const documents = await this.collection.find({ cmsUserId }).sort({ acceptedAt: 1 }).toArray();
        return documents.map(({ _id, ...proof }) => ({ id: _id, ...proof }));
    }

    private get collection(): Collection<SignupLegalAcceptanceDoc> {
        return this.db.collection<SignupLegalAcceptanceDoc>(this.prefix + "signup_legal_acceptances");
    }
}

function isUserIndex(key: Record<string, unknown> | undefined): boolean {
    return !!key && Object.keys(key).length === 1 && key.cmsUserId === 1;
}

function isDuplicateKeyError(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}

function isIndexNotFoundError(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 27;
}
