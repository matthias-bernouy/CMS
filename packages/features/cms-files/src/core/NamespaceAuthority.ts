import {
    authorizeNamespaceKey,
    CmsFilesError,
    credentialId,
    credentialVerifier,
    newCredential,
} from "cms-files/core/credentials";
import { boundedText, validFutureDate } from "cms-files/core/validation";
import type { CmsFilesStore, FileRecord, NamespacePermission } from "cms-files/interfaces";

const ALL_PERMISSIONS: readonly NamespacePermission[] = [
    "files.read",
    "files.write",
    "files.delete",
    "files.sign",
    "files.publish",
    "namespace.manage",
];

export class NamespaceAuthority {
    constructor(
        private readonly store: CmsFilesStore,
        private readonly now: () => Date,
        private readonly defaultQuota: { readonly maxBytes: number; readonly maxFiles: number },
    ) {}

    async create(input: {
        name: string;
        defaultVisibility: "private" | "public";
        createdBy: { kind: "administrator" | "provider" | "system"; id: string };
    }): Promise<{ namespaceId: string; keyId: string; namespaceKey: string }> {
        const namespaceId = "ns_" + crypto.randomUUID();
        const credential = newCredential("nsk");
        const now = this.now().toISOString();
        await this.store.createNamespace(
            {
                id: namespaceId,
                name: boundedText(input.name, 160),
                defaultVisibility: input.defaultVisibility,
                createdAt: now,
                createdBy: { kind: input.createdBy.kind, id: boundedText(input.createdBy.id, 256) },
                quota: this.defaultQuota,
            },
            {
                id: credential.id,
                namespaceId,
                verifier: await credentialVerifier(credential.value),
                permissions: ALL_PERMISSIONS,
                createdAt: now,
            },
        );
        return { namespaceId, keyId: credential.id, namespaceKey: credential.value };
    }

    async createKey(input: {
        namespaceId: string;
        namespaceKey: string;
        permissions: readonly NamespacePermission[];
        expiresAt?: string;
    }): Promise<{ keyId: string; namespaceKey: string }> {
        const authority = await this.authorize(input.namespaceKey, "namespace.manage");
        if (authority.namespaceId !== boundedText(input.namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const permissions = [...new Set(input.permissions)];
        if (permissions.length === 0 || permissions.some((permission) => !ALL_PERMISSIONS.includes(permission))) {
            throw new CmsFilesError("INVALID_INPUT", 422);
        }
        const expiresAt = input.expiresAt ? validFutureDate(input.expiresAt, this.now()) : undefined;
        const credential = newCredential("nsk");
        await this.store.putKey({
            id: credential.id,
            namespaceId: authority.namespaceId,
            verifier: await credentialVerifier(credential.value),
            permissions,
            createdAt: this.now().toISOString(),
            ...(expiresAt ? { expiresAt } : {}),
        });
        return { keyId: credential.id, namespaceKey: credential.value };
    }

    async get(namespaceId: string, namespaceKey: string) {
        const authority = await this.authorize(namespaceKey, "namespace.manage");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const namespace = await this.store.getNamespace(authority.namespaceId);
        if (!namespace) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        return namespace;
    }

    async rotateKey(namespaceId: string, namespaceKey: string, keyId: string) {
        const authority = await this.authorize(namespaceKey, "namespace.manage");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const target = await this.store.getKey(boundedText(keyId, 128));
        if (!target || target.namespaceId !== authority.namespaceId || target.revokedAt) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const replacement = await this.createKey({
            namespaceId,
            namespaceKey,
            permissions: target.permissions,
            ...(target.expiresAt ? { expiresAt: target.expiresAt } : {}),
        });
        await this.store.putKey({ ...target, revokedAt: this.now().toISOString() });
        return replacement;
    }

    async revokeKey(namespaceId: string, namespaceKey: string, keyId: string): Promise<void> {
        const authority = await this.authorize(namespaceKey, "namespace.manage");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const target = await this.store.getKey(boundedText(keyId, 128));
        if (!target || target.namespaceId !== authority.namespaceId) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        await this.store.putKey({ ...target, revokedAt: this.now().toISOString() });
    }

    async delete(
        namespaceId: string,
        namespaceKey: string,
        deleteRecord: (file: FileRecord) => Promise<void>,
    ): Promise<void> {
        const authority = await this.authorize(namespaceKey, "namespace.manage");
        if (authority.namespaceId !== boundedText(namespaceId, 128)) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        for (;;) {
            const files = await this.store.listFiles(namespaceId, 0, 100);
            if (files.length === 0) {
                break;
            }
            await Promise.all(files.map(deleteRecord));
        }
        await this.store.deleteNamespace(namespaceId);
    }

    async authorize(namespaceKey: string, permission: NamespacePermission) {
        const keyId = credentialId(namespaceKey, "nsk");
        return authorizeNamespaceKey(
            namespaceKey,
            await this.store.getKey(keyId),
            permission,
            this.now().toISOString(),
        );
    }

    async assertQuota(namespaceId: string, incomingBytes: number): Promise<void> {
        const namespace = await this.store.getNamespace(namespaceId);
        if (!namespace) {
            throw new CmsFilesError("NOT_FOUND", 404);
        }
        const files = await this.store.listFiles(namespaceId, 0, namespace.quota.maxFiles + 1);
        const bytes = files.reduce((total, file) => total + file.size, 0);
        if (files.length >= namespace.quota.maxFiles || bytes + incomingBytes > namespace.quota.maxBytes) {
            throw new CmsFilesError("QUOTA_EXCEEDED", 409);
        }
    }
}
