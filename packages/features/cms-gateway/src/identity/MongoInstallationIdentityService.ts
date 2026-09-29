import type { Collection, Db } from "mongodb";
import { identityAliasKey, identityScopeKey, identitySubjectKey } from "../core/identityKeys";
import type { InstallationIdentityScope, InstallationIdentityService } from "./InstallationIdentityService";

interface InstallationIdentityDocument {
    readonly scopeKey: string;
    readonly subjectKey: string;
    readonly aliasKey: string;
    readonly cmsSubjectId: string;
    readonly providerSubjectId: string;
}

/** Atomic pairwise aliases; callers must initialize indexes before serving traffic. */
export class MongoInstallationIdentityService implements InstallationIdentityService {
    readonly #collection: Collection<InstallationIdentityDocument>;

    constructor(db: Db, collectionName = "cms_gateway_identity_aliases") {
        this.#collection = db.collection<InstallationIdentityDocument>(collectionName);
    }

    async init(): Promise<void> {
        await this.#collection.createIndex({ subjectKey: 1 }, { unique: true });
        await this.#collection.createIndex({ aliasKey: 1 }, { unique: true });
        await this.#collection.createIndex({ scopeKey: 1 });
    }

    async getOrCreate(scope: InstallationIdentityScope, cmsSubjectId: string): Promise<string> {
        const scopeKey = identityScopeKey(scope);
        const subjectKey = identitySubjectKey(scope, cmsSubjectId);
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const providerSubjectId = crypto.randomUUID();
            const document: InstallationIdentityDocument = {
                scopeKey,
                subjectKey,
                aliasKey: identityAliasKey(scope, providerSubjectId),
                cmsSubjectId,
                providerSubjectId,
            };
            try {
                await this.#collection.updateOne({ subjectKey }, { $setOnInsert: document }, { upsert: true });
            } catch (error) {
                if (!isDuplicateKey(error)) {
                    throw error;
                }
            }
            const stored = await this.#collection.findOne({ subjectKey });
            if (stored) {
                return stored.providerSubjectId;
            }
        }
        throw new Error("could not allocate installation identity alias");
    }

    async resolve(scope: InstallationIdentityScope, providerSubjectId: string): Promise<string | null> {
        const aliasKey = identityAliasKey(scope, providerSubjectId);
        return (await this.#collection.findOne({ aliasKey }))?.cmsSubjectId ?? null;
    }

    async revoke(scope: InstallationIdentityScope): Promise<void> {
        await this.#collection.deleteMany({ scopeKey: identityScopeKey(scope) });
    }
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
