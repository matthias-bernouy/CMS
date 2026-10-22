import type { Collection } from "mongodb";
import type {
    CmsSecretMetadata,
    SecretNamespaceKeyRecord,
    SecretNamespaceRecord,
} from "cms-secrets/interfaces/CmsSecret";
import type { CmsSecretMetadataStore } from "cms-secrets/interfaces/CmsSecretMetadataStore";

type SecretDocument = Omit<CmsSecretMetadata, "id"> & { _id: string };
type NamespaceDocument = Omit<SecretNamespaceRecord, "id"> & { _id: string };
type NamespaceKeyDocument = Omit<SecretNamespaceKeyRecord, "id"> & { _id: string };

export class MongoCmsSecretMetadataStore implements CmsSecretMetadataStore {
    constructor(
        private readonly collections: {
            secrets: Collection<SecretDocument>;
            namespaces: Collection<NamespaceDocument>;
            namespaceKeys: Collection<NamespaceKeyDocument>;
        },
    ) {}

    async init(): Promise<void> {
        await Promise.all([
            this.collections.secrets.createIndex({ namespaceId: 1, name: 1 }, { unique: true }),
            this.collections.namespaceKeys.createIndex({ namespaceId: 1 }),
        ]);
    }

    async createNamespace(namespace: SecretNamespaceRecord, key: SecretNamespaceKeyRecord): Promise<void> {
        await this.collections.namespaces.insertOne(document(namespace));
        try {
            await this.collections.namespaceKeys.insertOne(document(key));
        } catch (error) {
            await this.collections.namespaces.deleteOne({ _id: namespace.id });
            throw error;
        }
    }

    async getNamespace(id: string): Promise<SecretNamespaceRecord | null> {
        return project(await this.collections.namespaces.findOne({ _id: id }));
    }

    async deleteNamespace(id: string): Promise<void> {
        await this.collections.namespaces.deleteOne({ _id: id });
        await this.collections.namespaceKeys.deleteMany({ namespaceId: id });
    }

    async getNamespaceKey(id: string): Promise<SecretNamespaceKeyRecord | null> {
        return project(await this.collections.namespaceKeys.findOne({ _id: id }));
    }

    async putNamespaceKey(key: SecretNamespaceKeyRecord): Promise<void> {
        await this.collections.namespaceKeys.replaceOne({ _id: key.id }, document(key), { upsert: true });
    }

    async get(id: string): Promise<CmsSecretMetadata | null> {
        return project(await this.collections.secrets.findOne({ _id: id }));
    }

    async findByName(namespaceId: string, name: string): Promise<CmsSecretMetadata | null> {
        return project(await this.collections.secrets.findOne({ namespaceId, name }));
    }

    async list(namespaceId: string, limit: number): Promise<readonly CmsSecretMetadata[]> {
        return (await this.collections.secrets.find({ namespaceId }).sort({ name: 1 }).limit(limit).toArray()).map(
            projectRequired,
        );
    }

    async create(secret: CmsSecretMetadata): Promise<boolean> {
        try {
            await this.collections.secrets.insertOne(document(secret));
            return true;
        } catch (error) {
            if (isDuplicateKey(error)) {
                return false;
            }
            throw error;
        }
    }

    async replace(secret: CmsSecretMetadata, expectedVersion: number): Promise<boolean> {
        const result = await this.collections.secrets.replaceOne(
            { _id: secret.id, version: expectedVersion },
            document(secret),
        );
        return result.modifiedCount === 1;
    }

    async delete(id: string, expectedVersion: number): Promise<boolean> {
        return (await this.collections.secrets.deleteOne({ _id: id, version: expectedVersion })).deletedCount === 1;
    }
}

function document<T extends { id: string }>(value: T): Omit<T, "id"> & { _id: string } {
    const { id, ...rest } = value;
    return { _id: id, ...rest };
}

function project<T extends { _id: string }>(value: T | null): (Omit<T, "_id"> & { id: string }) | null {
    return value ? projectRequired(value) : null;
}

function projectRequired<T extends { _id: string }>(value: T): Omit<T, "_id"> & { id: string } {
    const { _id, ...rest } = value;
    return { id: _id, ...rest };
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}
