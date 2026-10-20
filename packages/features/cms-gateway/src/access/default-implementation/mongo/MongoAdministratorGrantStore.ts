import type { Collection, Db } from "mongodb";

type AdministratorGrant = Readonly<{
    sub: string;
    enabled: boolean;
    revision: number;
    createdAt: Date;
    updatedAt: Date;
}>;

type AdministratorAuthority = Readonly<{
    _id: "authority";
    revision: number;
    grants: readonly AdministratorGrant[];
}>;

const MAX_ATTEMPTS = 8;

/** Serializes administrator mutations in one Mongo document so the last grant cannot be revoked concurrently. */
export class MongoAdministratorGrantStore {
    readonly #authority: Collection<AdministratorAuthority>;

    constructor(db: Db) {
        this.#authority = db.collection("cms_administrator_authority");
    }

    async canRevoke(sub: string): Promise<boolean> {
        const document = await this.#read();
        const current = document.grants.find((grant) => grant.sub === sub);
        return !current?.enabled || document.grants.filter((grant) => grant.enabled).length > 1;
    }

    async get(sub: string) {
        const current = (await this.#read()).grants.find((grant) => grant.sub === sub);
        return state(sub, current);
    }

    async list(): Promise<string[]> {
        return (await this.#read()).grants.filter((grant) => grant.enabled).map((grant) => grant.sub);
    }

    async set(sub: string, enabled: boolean, expectedRevision?: number) {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const document = await this.#read();
            const current = document.grants.find((grant) => grant.sub === sub);
            const currentState = state(sub, current);
            if (expectedRevision !== undefined && currentState.revision !== expectedRevision) {
                throw conflict("administrator grant revision conflict");
            }
            if (currentState.enabled === enabled) {
                return currentState;
            }
            if (!enabled && document.grants.filter((grant) => grant.enabled).length <= 1) {
                throw conflict("the last administrator grant cannot be revoked");
            }
            const now = new Date();
            const updated: AdministratorGrant = {
                sub,
                enabled,
                revision: currentState.revision + 1,
                createdAt: current?.createdAt ?? now,
                updatedAt: now,
            };
            const grants = [...document.grants.filter((grant) => grant.sub !== sub), updated];
            grants.sort((left, right) => left.sub.localeCompare(right.sub));
            const next: AdministratorAuthority = {
                _id: "authority",
                revision: document.revision + 1,
                grants,
            };
            if (await this.#replace(document.revision, next)) {
                return state(sub, updated);
            }
        }
        throw conflict("administrator authority changed concurrently");
    }

    async #read(): Promise<AdministratorAuthority> {
        return (await this.#authority.findOne({ _id: "authority" })) ?? emptyAuthority();
    }

    async #replace(expectedRevision: number, document: AdministratorAuthority): Promise<boolean> {
        if (expectedRevision > 0) {
            const result = await this.#authority.replaceOne({ _id: "authority", revision: expectedRevision }, document);
            return result.matchedCount === 1;
        }
        try {
            await this.#authority.insertOne(document);
            return true;
        } catch (error) {
            if (isDuplicateKey(error)) {
                return false;
            }
            throw error;
        }
    }
}

function emptyAuthority(): AdministratorAuthority {
    return { _id: "authority", revision: 0, grants: [] };
}

function state(sub: string, grant?: AdministratorGrant) {
    return {
        sub,
        enabled: grant?.enabled ?? false,
        revision: grant?.revision ?? 0,
        bootstrap: false as const,
    };
}

function conflict(message: string): Error & { status: number } {
    return Object.assign(new Error(message), { status: 409 });
}

function isDuplicateKey(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}
