import type {
    CmsSecretMetadata,
    SecretNamespaceKeyRecord,
    SecretNamespaceRecord,
} from "cms-secrets/interfaces/CmsSecret";
import type { CmsSecretMetadataStore } from "cms-secrets/interfaces/CmsSecretMetadataStore";

export class InMemoryCmsSecretMetadataStore implements CmsSecretMetadataStore {
    readonly #items = new Map<string, CmsSecretMetadata>();
    readonly #namespaces = new Map<string, SecretNamespaceRecord>();
    readonly #keys = new Map<string, SecretNamespaceKeyRecord>();

    async createNamespace(namespace: SecretNamespaceRecord, key: SecretNamespaceKeyRecord): Promise<void> {
        this.#namespaces.set(namespace.id, structuredClone(namespace));
        this.#keys.set(key.id, structuredClone(key));
    }

    async getNamespace(id: string): Promise<SecretNamespaceRecord | null> {
        return clone(this.#namespaces.get(id));
    }

    async deleteNamespace(id: string): Promise<void> {
        this.#namespaces.delete(id);
        for (const [keyId, key] of this.#keys) {
            if (key.namespaceId === id) {
                this.#keys.delete(keyId);
            }
        }
    }

    async getNamespaceKey(id: string): Promise<SecretNamespaceKeyRecord | null> {
        return clone(this.#keys.get(id));
    }

    async putNamespaceKey(key: SecretNamespaceKeyRecord): Promise<void> {
        this.#keys.set(key.id, structuredClone(key));
    }

    async get(id: string): Promise<CmsSecretMetadata | null> {
        return clone(this.#items.get(id));
    }

    async findByName(namespaceId: string, name: string): Promise<CmsSecretMetadata | null> {
        return clone([...this.#items.values()].find((item) => item.namespaceId === namespaceId && item.name === name));
    }

    async list(namespaceId: string, limit: number): Promise<readonly CmsSecretMetadata[]> {
        return [...this.#items.values()]
            .filter((item) => item.namespaceId === namespaceId)
            .sort((left, right) => left.name.localeCompare(right.name))
            .slice(0, limit)
            .map((item) => clone(item)!);
    }

    async create(secret: CmsSecretMetadata): Promise<boolean> {
        if (
            this.#items.has(secret.id) ||
            [...this.#items.values()].some(
                (item) => item.namespaceId === secret.namespaceId && item.name === secret.name,
            )
        ) {
            return false;
        }
        this.#items.set(secret.id, clone(secret)!);
        return true;
    }

    async replace(secret: CmsSecretMetadata, expectedVersion: number): Promise<boolean> {
        const current = this.#items.get(secret.id);
        if (!current || current.version !== expectedVersion) {
            return false;
        }
        this.#items.set(secret.id, clone(secret)!);
        return true;
    }

    async delete(id: string, expectedVersion: number): Promise<boolean> {
        const current = this.#items.get(id);
        return !!current && current.version === expectedVersion && this.#items.delete(id);
    }
}

function clone<T>(value: T | undefined): T | null {
    return value ? structuredClone(value) : null;
}
