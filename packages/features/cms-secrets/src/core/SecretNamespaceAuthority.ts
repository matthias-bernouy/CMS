import { authorizeNamespaceKey, credentialId, credentialVerifier, newCredential } from "cms-secrets/core/credentials";
import { CmsSecretNotFound } from "cms-secrets/core/errors";
import type { SecretNamespaceKeyRecord, SecretNamespacePermission } from "cms-secrets/interfaces/CmsSecret";
import type { CmsSecretMetadataStore } from "cms-secrets/interfaces/CmsSecretMetadataStore";

const ALL_PERMISSIONS: readonly SecretNamespacePermission[] = [
    "secrets.metadata.read",
    "secrets.resolve",
    "secrets.write",
    "secrets.delete",
    "namespace.manage",
];

export class SecretNamespaceAuthority {
    constructor(
        private readonly store: CmsSecretMetadataStore,
        private readonly now: () => Date,
    ) {}

    async create(input: {
        name: string;
        createdBy: { kind: "administrator" | "provider" | "system"; id: string };
    }): Promise<{ namespaceId: string; keyId: string; namespaceKey: string }> {
        const namespaceId = `sns_${crypto.randomUUID()}`;
        const credential = newCredential("snk");
        const createdAt = this.now();
        await this.store.createNamespace(
            { id: namespaceId, name: input.name, createdAt, createdBy: input.createdBy },
            {
                id: credential.id,
                namespaceId,
                verifier: await credentialVerifier(credential.value),
                permissions: ALL_PERMISSIONS,
                createdAt,
            },
        );
        return { namespaceId, keyId: credential.id, namespaceKey: credential.value };
    }

    async get(namespaceId: string, namespaceKey: string) {
        await this.authorizeFor(namespaceId, namespaceKey, "namespace.manage");
        const namespace = await this.store.getNamespace(namespaceId);
        if (!namespace) {
            throw new CmsSecretNotFound("secret namespace does not exist");
        }
        return namespace;
    }

    async createKey(input: {
        namespaceId: string;
        namespaceKey: string;
        permissions: readonly SecretNamespacePermission[];
        expiresAt?: Date;
    }): Promise<{ keyId: string; namespaceKey: string }> {
        await this.authorizeFor(input.namespaceId, input.namespaceKey, "namespace.manage");
        const permissions = [...new Set(input.permissions)];
        if (permissions.length === 0 || permissions.some((permission) => !ALL_PERMISSIONS.includes(permission))) {
            throw new TypeError("invalid secret namespace permissions");
        }
        const credential = newCredential("snk");
        await this.store.putNamespaceKey({
            id: credential.id,
            namespaceId: input.namespaceId,
            verifier: await credentialVerifier(credential.value),
            permissions,
            createdAt: this.now(),
            ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        });
        return { keyId: credential.id, namespaceKey: credential.value };
    }

    async rotateKey(namespaceId: string, namespaceKey: string, keyId: string) {
        await this.authorizeFor(namespaceId, namespaceKey, "namespace.manage");
        const target = await this.requiredKey(namespaceId, keyId);
        const replacement = await this.createKey({
            namespaceId,
            namespaceKey,
            permissions: target.permissions,
            ...(target.expiresAt ? { expiresAt: target.expiresAt } : {}),
        });
        await this.store.putNamespaceKey({ ...target, revokedAt: this.now() });
        return replacement;
    }

    async revokeKey(namespaceId: string, namespaceKey: string, keyId: string): Promise<void> {
        await this.authorizeFor(namespaceId, namespaceKey, "namespace.manage");
        const target = await this.requiredKey(namespaceId, keyId);
        await this.store.putNamespaceKey({ ...target, revokedAt: this.now() });
    }

    async authorizeFor(
        namespaceId: string,
        namespaceKey: string,
        permission: SecretNamespacePermission | readonly SecretNamespacePermission[],
    ) {
        const key = await authorizeNamespaceKey(
            namespaceKey,
            await this.store.getNamespaceKey(credentialId(namespaceKey, "snk")),
            permission,
            this.now(),
        );
        if (key.namespaceId !== namespaceId) {
            throw new CmsSecretNotFound("secret namespace does not exist");
        }
        return key;
    }

    private async requiredKey(namespaceId: string, keyId: string): Promise<SecretNamespaceKeyRecord> {
        const key = await this.store.getNamespaceKey(keyId);
        if (!key || key.namespaceId !== namespaceId || key.revokedAt) {
            throw new CmsSecretNotFound("secret namespace key does not exist");
        }
        return key;
    }
}
