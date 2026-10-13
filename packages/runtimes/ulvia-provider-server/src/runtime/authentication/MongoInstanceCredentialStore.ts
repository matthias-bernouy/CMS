import type { Collection, Db } from "mongodb";
import type { InstanceCredential, InstanceCredentialStore } from "./InstanceCredentialStore";

type CredentialDocument = Omit<InstanceCredential, "createdAt" | "updatedAt"> & {
    createdAt: Date;
    updatedAt: Date;
};

export class MongoInstanceCredentialStore implements InstanceCredentialStore {
    readonly #credentials: Collection<CredentialDocument>;

    constructor(db: Db) {
        this.#credentials = db.collection("ulvia_provider_instance_credentials");
    }

    async init(): Promise<void> {
        await Promise.all([
            this.#credentials.createIndex({ instanceId: 1 }, { unique: true }),
            this.#credentials.createIndex({ invocationKeyId: 1 }, { unique: true }),
            this.#credentials.createIndex({ accessTokenHash: 1 }, { unique: true }),
        ]);
    }

    async put(
        credential: Omit<InstanceCredential, "revision" | "createdAt" | "updatedAt">,
    ): Promise<InstanceCredential> {
        const now = new Date();
        const document: CredentialDocument = { ...credential, revision: 1, createdAt: now, updatedAt: now };
        await this.#credentials.insertOne(document);
        return serialize(document);
    }

    async getByInvocationKeyId(invocationKeyId: string): Promise<InstanceCredential | null> {
        return serializeNullable(await this.#credentials.findOne({ invocationKeyId, enabled: true }));
    }

    async getByInstanceId(instanceId: string): Promise<InstanceCredential | null> {
        return serializeNullable(await this.#credentials.findOne({ instanceId }));
    }

    async getByAccessTokenHash(accessTokenHash: string): Promise<InstanceCredential | null> {
        return serializeNullable(await this.#credentials.findOne({ accessTokenHash, enabled: true }));
    }

    async disable(instanceId: string, expectedRevision: number): Promise<void> {
        const result = await this.#credentials.updateOne(
            { instanceId, revision: expectedRevision },
            { $set: { enabled: false, updatedAt: new Date() }, $inc: { revision: 1 } },
        );
        if (result.matchedCount !== 1) {
            throw new Error(`Instance credential revision conflict: ${instanceId}`);
        }
    }
}

function serializeNullable(document: CredentialDocument | null): InstanceCredential | null {
    return document ? serialize(document) : null;
}

function serialize(document: CredentialDocument): InstanceCredential {
    const { instanceId, invocationKeyId, accessTokenHash, secretKey, enabled, revision } = document;
    return {
        instanceId,
        invocationKeyId,
        accessTokenHash,
        secretKey,
        enabled,
        revision,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
    };
}
