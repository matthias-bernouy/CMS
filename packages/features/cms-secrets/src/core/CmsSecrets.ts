import type { SecretStore } from "@bernouy/secret-store";
import { SecretNamespaceAuthority } from "cms-secrets/core/SecretNamespaceAuthority";
import { CmsSecretConflict, CmsSecretNotFound } from "cms-secrets/core/errors";
import {
    publicSecretMetadata,
    type PublicSecretMetadata,
    type SecretNamespacePermission,
} from "cms-secrets/interfaces/CmsSecret";
import type { CmsSecretMetadataStore } from "cms-secrets/interfaces/CmsSecretMetadataStore";

export class CmsSecrets {
    readonly namespaces: SecretNamespaceAuthority;

    constructor(
        private readonly metadata: CmsSecretMetadataStore,
        private readonly values: SecretStore,
        private readonly createId: () => string = () => crypto.randomUUID(),
        private readonly now: () => Date = () => new Date(),
    ) {
        this.namespaces = new SecretNamespaceAuthority(metadata, now);
    }

    createNamespace(input: { name: string; createdBy: { kind: "administrator" | "provider" | "system"; id: string } }) {
        return this.namespaces.create(input);
    }

    getNamespace(namespaceId: string, namespaceKey: string) {
        return this.namespaces.get(namespaceId, namespaceKey);
    }

    createNamespaceKey(input: {
        namespaceId: string;
        namespaceKey: string;
        permissions: readonly SecretNamespacePermission[];
        expiresAt?: Date;
    }) {
        return this.namespaces.createKey(input);
    }

    rotateNamespaceKey(namespaceId: string, namespaceKey: string, keyId: string) {
        return this.namespaces.rotateKey(namespaceId, namespaceKey, keyId);
    }

    revokeNamespaceKey(namespaceId: string, namespaceKey: string, keyId: string) {
        return this.namespaces.revokeKey(namespaceId, namespaceKey, keyId);
    }

    async deleteNamespace(namespaceId: string, namespaceKey: string): Promise<void> {
        await this.namespaces.authorizeFor(namespaceId, namespaceKey, "namespace.manage");
        for (;;) {
            const secrets = await this.metadata.list(namespaceId, 100);
            if (secrets.length === 0) {
                break;
            }
            await Promise.all(
                secrets.map(async (secret) => {
                    await this.values.delete(secret.storageKey);
                    await this.metadata.delete(secret.id, secret.version);
                }),
            );
        }
        await this.metadata.deleteNamespace(namespaceId);
    }

    async create(
        namespaceId: string,
        namespaceKey: string,
        name: string,
        value: string,
    ): Promise<PublicSecretMetadata> {
        await this.namespaces.authorizeFor(namespaceId, namespaceKey, "secrets.write");
        if (await this.metadata.findByName(namespaceId, name)) {
            throw new CmsSecretConflict("secret name already exists");
        }
        const id = this.createId();
        const storageKey = `CMS_SECRET_${id.replaceAll("-", "_").toUpperCase()}`;
        const secret = { id, namespaceId, name, storageKey, version: 1, createdAt: this.now() };
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

    async get(namespaceId: string, namespaceKey: string, id: string): Promise<PublicSecretMetadata> {
        await this.namespaces.authorizeFor(namespaceId, namespaceKey, "secrets.metadata.read");
        return publicSecretMetadata(await this.required(namespaceId, id));
    }

    async list(namespaceId: string, namespaceKey: string, limit: number): Promise<readonly PublicSecretMetadata[]> {
        await this.namespaces.authorizeFor(namespaceId, namespaceKey, "secrets.metadata.read");
        return (await this.metadata.list(namespaceId, limit)).map(publicSecretMetadata);
    }

    async rotate(
        namespaceId: string,
        namespaceKey: string,
        id: string,
        expectedVersion: number,
        value: string,
    ): Promise<PublicSecretMetadata> {
        await this.namespaces.authorizeFor(namespaceId, namespaceKey, "secrets.write");
        const current = await this.required(namespaceId, id);
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

    async delete(namespaceId: string, namespaceKey: string, id: string, expectedVersion: number): Promise<boolean> {
        await this.namespaces.authorizeFor(namespaceId, namespaceKey, "secrets.delete");
        const current = await this.metadata.get(id);
        if (!current || current.namespaceId !== namespaceId) {
            return false;
        }
        if (!(await this.metadata.delete(id, expectedVersion))) {
            throw new CmsSecretConflict("secret version changed");
        }
        await this.values.delete(current.storageKey);
        return true;
    }

    async resolve(namespaceId: string, namespaceKey: string, id: string) {
        await this.namespaces.authorizeFor(namespaceId, namespaceKey, "secrets.resolve");
        const secret = await this.required(namespaceId, id);
        const value = await this.values.get(secret.storageKey);
        if (value === null) {
            throw new CmsSecretNotFound("secret value is unavailable");
        }
        return { namespaceId, secretId: secret.id, version: secret.version, value };
    }

    private async required(namespaceId: string, id: string) {
        const secret = await this.metadata.get(id);
        if (!secret || secret.namespaceId !== namespaceId) {
            throw new CmsSecretNotFound("secret does not exist");
        }
        return secret;
    }
}
