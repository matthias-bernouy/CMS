import type { CmsSecretMetadata } from "cms-secrets/interfaces/CmsSecret";
import type { CmsSecretMetadataStore } from "cms-secrets/interfaces/CmsSecretMetadataStore";

export class InMemoryCmsSecretMetadataStore implements CmsSecretMetadataStore {
    readonly #items = new Map<string, CmsSecretMetadata>();

    async get(id: string): Promise<CmsSecretMetadata | null> {
        return clone(this.#items.get(id));
    }

    async findByName(name: string): Promise<CmsSecretMetadata | null> {
        return clone([...this.#items.values()].find((item) => item.name === name));
    }

    async list(limit: number): Promise<readonly CmsSecretMetadata[]> {
        return [...this.#items.values()]
            .sort((left, right) => left.name.localeCompare(right.name))
            .slice(0, limit)
            .map((item) => clone(item)!);
    }

    async create(secret: CmsSecretMetadata): Promise<boolean> {
        if (this.#items.has(secret.id) || [...this.#items.values()].some((item) => item.name === secret.name)) {
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

function clone(value: CmsSecretMetadata | undefined): CmsSecretMetadata | null {
    return value ? structuredClone(value) : null;
}
