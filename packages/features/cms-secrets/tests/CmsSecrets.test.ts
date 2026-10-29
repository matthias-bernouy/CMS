import { describe, expect, test } from "bun:test";
import {
    CmsSecretConflict,
    CmsSecretNamespaceStore,
    CmsSecretNotAuthorized,
    CmsSecretNotFound,
    CmsSecrets,
} from "@bernouy/cms-secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/cms-secrets/memory";
import { InMemorySecretStore, ValidatingSecretStore } from "@bernouy/secret-store";

describe("CmsSecrets", () => {
    test("stores values inside an explicit credential-owned namespace", async () => {
        const secrets = fixture();
        const namespace = await createNamespace(secrets, "payments");

        const created = await secrets.create(
            namespace.namespaceId,
            namespace.namespaceKey,
            "payment-token",
            "first-value",
        );

        expect(created).toMatchObject({
            namespaceId: namespace.namespaceId,
            secretId: "secret-1",
            name: "payment-token",
            version: 1,
            createdAt: "2026-10-22T10:00:00.000Z",
            rotatedAt: null,
        });
        expect(
            JSON.stringify(await secrets.get(namespace.namespaceId, namespace.namespaceKey, created.secretId)),
        ).not.toContain("first-value");
        expect(await secrets.resolve(namespace.namespaceId, namespace.namespaceKey, created.secretId)).toMatchObject({
            namespaceId: namespace.namespaceId,
            secretId: "secret-1",
            version: 1,
            value: "first-value",
        });
    });

    test("scopes credentials by namespace and permission", async () => {
        const secrets = fixture();
        const payments = await createNamespace(secrets, "payments");
        const email = await createNamespace(secrets, "email");
        const created = await secrets.create(payments.namespaceId, payments.namespaceKey, "payment-token", "value");
        const metadataKey = await secrets.createNamespaceKey({
            namespaceId: payments.namespaceId,
            namespaceKey: payments.namespaceKey,
            permissions: ["secrets.metadata.read"],
        });

        expect(await secrets.get(payments.namespaceId, metadataKey.namespaceKey, created.secretId)).toMatchObject({
            name: "payment-token",
        });
        await expect(
            secrets.resolve(payments.namespaceId, metadataKey.namespaceKey, created.secretId),
        ).rejects.toBeInstanceOf(CmsSecretNotAuthorized);
        await expect(secrets.get(email.namespaceId, payments.namespaceKey, created.secretId)).rejects.toBeInstanceOf(
            CmsSecretNotFound,
        );
    });

    test("rotates and revokes namespace credentials", async () => {
        const secrets = fixture();
        const namespace = await createNamespace(secrets, "payments");
        const scoped = await secrets.createNamespaceKey({
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            permissions: ["secrets.resolve"],
        });
        const replacement = await secrets.rotateNamespaceKey(
            namespace.namespaceId,
            namespace.namespaceKey,
            scoped.keyId,
        );

        await expect(secrets.resolve(namespace.namespaceId, scoped.namespaceKey, "missing")).rejects.toBeInstanceOf(
            CmsSecretNotAuthorized,
        );
        await secrets.revokeNamespaceKey(namespace.namespaceId, namespace.namespaceKey, replacement.keyId);
        await expect(
            secrets.resolve(namespace.namespaceId, replacement.namespaceKey, "missing"),
        ).rejects.toBeInstanceOf(CmsSecretNotAuthorized);
    });

    test("rotates secret values with optimistic version control", async () => {
        const secrets = fixture();
        const namespace = await createNamespace(secrets, "payments");
        const created = await secrets.create(namespace.namespaceId, namespace.namespaceKey, "token", "first");

        const rotated = await secrets.rotate(
            namespace.namespaceId,
            namespace.namespaceKey,
            created.secretId,
            1,
            "second",
        );

        expect(rotated.version).toBe(2);
        await expect(
            secrets.rotate(namespace.namespaceId, namespace.namespaceKey, created.secretId, 1, "stale"),
        ).rejects.toBeInstanceOf(CmsSecretConflict);
        expect(await secrets.resolve(namespace.namespaceId, namespace.namespaceKey, created.secretId)).toMatchObject({
            version: 2,
            value: "second",
        });
    });

    test("deletes every encrypted value with its namespace", async () => {
        const secrets = fixture();
        const namespace = await createNamespace(secrets, "payments");
        const created = await secrets.create(namespace.namespaceId, namespace.namespaceKey, "token", "value");

        await secrets.deleteNamespace(namespace.namespaceId, namespace.namespaceKey);

        await expect(
            secrets.resolve(namespace.namespaceId, namespace.namespaceKey, created.secretId),
        ).rejects.toBeInstanceOf(CmsSecretNotAuthorized);
    });

    test("adapts one namespace to the generic named-secret port", async () => {
        const secrets = fixture();
        const namespace = await createNamespace(secrets, "access");
        const key = await secrets.createNamespaceKey({
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            permissions: ["secrets.metadata.read", "secrets.resolve", "secrets.write", "secrets.delete"],
        });
        const store = new ValidatingSecretStore(
            new CmsSecretNamespaceStore(secrets, {
                namespaceId: namespace.namespaceId,
                namespaceKey: key.namespaceKey,
            }),
        );

        expect(await store.get("SMTP_PASSWORD")).toBeNull();
        await store.set("SMTP_PASSWORD", "first");
        await store.set("SMTP_PASSWORD", "second");
        expect(await store.get("SMTP_PASSWORD")).toBe("second");
        expect(await store.listKeys()).toEqual(["SMTP_PASSWORD"]);
        await store.delete("SMTP_PASSWORD");
        expect(await store.get("SMTP_PASSWORD")).toBeNull();
    });
});

function fixture(): CmsSecrets {
    let nextId = 0;
    return new CmsSecrets(new InMemoryCmsSecretMetadataStore(), new InMemorySecretStore(), {
        createId: () => `secret-${++nextId}`,
        now: () => new Date("2026-10-22T10:00:00.000Z"),
    });
}

function createNamespace(secrets: CmsSecrets, name: string) {
    return secrets.createNamespace({
        name,
        createdBy: { kind: "administrator", id: "admin-1" },
    });
}
