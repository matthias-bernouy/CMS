import type { Collection } from "mongodb";
import type { CmsSecretMetadata } from "cms-secrets/interfaces/CmsSecret";
import type { CmsSecretMetadataStore } from "cms-secrets/interfaces/CmsSecretMetadataStore";

type SecretDocument = {
    _id: string;
    name: string;
    storageKey: string;
    version: number;
    createdAt: Date;
    rotatedAt?: Date;
};

export class MongoCmsSecretMetadataStore implements CmsSecretMetadataStore {
    constructor(private readonly collection: Collection<SecretDocument>) {}

    async init(): Promise<void> {
        await this.collection.createIndex({ name: 1 }, { unique: true });
    }

    async get(id: string): Promise<CmsSecretMetadata | null> {
        return project(await this.collection.findOne({ _id: id }));
    }

    async findByName(name: string): Promise<CmsSecretMetadata | null> {
        return project(await this.collection.findOne({ name }));
    }

    async list(limit: number): Promise<readonly CmsSecretMetadata[]> {
        return (await this.collection.find({}).sort({ name: 1 }).limit(limit).toArray()).map(projectRequired);
    }

    async create(secret: CmsSecretMetadata): Promise<boolean> {
        try {
            await this.collection.insertOne(document(secret));
            return true;
        } catch (error) {
            if (isDuplicateKey(error)) {
                return false;
            }
            throw error;
        }
    }

    async replace(secret: CmsSecretMetadata, expectedVersion: number): Promise<boolean> {
        const result = await this.collection.replaceOne({ _id: secret.id, version: expectedVersion }, document(secret));
        return result.modifiedCount === 1;
    }

    async delete(id: string, expectedVersion: number): Promise<boolean> {
        return (await this.collection.deleteOne({ _id: id, version: expectedVersion })).deletedCount === 1;
    }
}

function document(secret: CmsSecretMetadata): SecretDocument {
    return {
        _id: secret.id,
        name: secret.name,
        storageKey: secret.storageKey,
        version: secret.version,
        createdAt: secret.createdAt,
        ...(secret.rotatedAt ? { rotatedAt: secret.rotatedAt } : {}),
    };
}

function project(value: SecretDocument | null): CmsSecretMetadata | null {
    return value ? projectRequired(value) : null;
}

function projectRequired(value: SecretDocument): CmsSecretMetadata {
    return {
        id: value._id,
        name: value.name,
        storageKey: value.storageKey,
        version: value.version,
        createdAt: value.createdAt,
        ...(value.rotatedAt ? { rotatedAt: value.rotatedAt } : {}),
    };
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}
