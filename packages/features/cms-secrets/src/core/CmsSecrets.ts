import type { SecretStore } from "@bernouy/secret-store";
import { publicSecretMetadata, type PublicSecretMetadata } from "cms-secrets/interfaces/CmsSecret";
import type { CmsSecretMetadataStore } from "cms-secrets/interfaces/CmsSecretMetadataStore";

export class CmsSecretConflict extends Error {}
export class CmsSecretNotFound extends Error {}

export class CmsSecrets {
    constructor(
        private readonly metadata: CmsSecretMetadataStore,
        private readonly values: SecretStore,
        private readonly createId: () => string = () => crypto.randomUUID(),
        private readonly now: () => Date = () => new Date(),
    ) {}

    async create(name: string, value: string): Promise<PublicSecretMetadata> {
        if (await this.metadata.findByName(name)) {
            throw new CmsSecretConflict("secret name already exists");
        }
        const id = this.createId();
        const storageKey = `CMS_SECRET_${id.replaceAll("-", "_").toUpperCase()}`;
        const secret = { id, name, storageKey, version: 1, createdAt: this.now() };
        if (!(await this.metadata.create(secret))) {
            throw new CmsSecretConflict("secret name already exists");
        }
        try {
            await this.values.set(storageKey, value);
        } catch (error) {
            await this.metadata.delete(id, 1).catch(() => false);
            throw error;
        }
        return publicSecretMetadata(secret);
    }

    async get(id: string): Promise<PublicSecretMetadata> {
        return publicSecretMetadata(await this.required(id));
    }

    async list(limit: number): Promise<readonly PublicSecretMetadata[]> {
        return (await this.metadata.list(limit)).map(publicSecretMetadata);
    }

    async rotate(id: string, expectedVersion: number, value: string): Promise<PublicSecretMetadata> {
        const current = await this.required(id);
        if (current.version !== expectedVersion) {
            throw new CmsSecretConflict("secret version changed");
        }
        const previousValue = await this.values.get(current.storageKey);
        if (previousValue === null) {
            throw new CmsSecretNotFound("secret value is unavailable");
        }
        await this.values.set(current.storageKey, value);
        const next = { ...current, version: current.version + 1, rotatedAt: this.now() };
        if (!(await this.metadata.replace(next, expectedVersion))) {
            await this.values.set(current.storageKey, previousValue);
            throw new CmsSecretConflict("secret version changed");
        }
        return publicSecretMetadata(next);
    }

    async delete(id: string, expectedVersion: number): Promise<boolean> {
        const current = await this.metadata.get(id);
        if (!current) {
            return false;
        }
        if (!(await this.metadata.delete(id, expectedVersion))) {
            throw new CmsSecretConflict("secret version changed");
        }
        await this.values.delete(current.storageKey);
        return true;
    }

    async resolve(id: string): Promise<{ secretId: string; version: number; value: string }> {
        const secret = await this.required(id);
        const value = await this.values.get(secret.storageKey);
        if (value === null) {
            throw new CmsSecretNotFound("secret value is unavailable");
        }
        return { secretId: secret.id, version: secret.version, value };
    }

    private async required(id: string) {
        const secret = await this.metadata.get(id);
        if (!secret) {
            throw new CmsSecretNotFound("secret does not exist");
        }
        return secret;
    }
}
