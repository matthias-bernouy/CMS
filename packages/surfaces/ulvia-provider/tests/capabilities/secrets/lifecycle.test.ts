import { expect, test } from "bun:test";
import { secretsFixture } from "./fixture";

test("generated Secrets capabilities cover namespace, key and value lifecycle without exposing values in metadata", async () => {
    const f = await secretsFixture();
    try {
        const namespace = await f.invoke("namespace.create", { name: "Payments" });
        const credentials = { namespaceId: namespace.namespaceId, namespaceKey: namespace.namespaceKey };
        const metadata = await f.invoke("namespace.get", credentials);
        expect(metadata.createdBy).toEqual({ kind: "administrator", id: "admin-a" });
        const created = await f.invoke("secrets.create", {
            ...credentials,
            name: "stripe-token",
            value: "private-secret-value",
        });
        expect(JSON.stringify(created)).not.toContain("private-secret-value");
        expect(await f.invoke("secrets.get-metadata", { ...credentials, secretId: created.secretId })).toEqual(created);
        expect(await f.invoke("secrets.get-metadata-by-name", { ...credentials, name: "stripe-token" })).toEqual(
            created,
        );
        expect(await f.invoke("secrets.get-metadata-by-name", { ...credentials, name: "missing" })).toBeNull();
        expect(await f.invoke("secrets.resolve", { ...credentials, secretId: created.secretId })).toMatchObject({
            value: "private-secret-value",
            version: 1,
        });
        const rotated = await f.invoke("secrets.rotate", {
            ...credentials,
            secretId: created.secretId,
            expectedVersion: 1,
            value: "replacement",
        });
        expect(rotated.version).toBe(2);
        expect(rotated.rotatedAt).not.toBeNull();
        const key = await f.invoke("namespace.keys.create", {
            ...credentials,
            permissions: ["secrets.metadata.read"],
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
        const nextKey = await f.invoke("namespace.keys.rotate", { ...credentials, keyId: key.keyId });
        expect(nextKey.keyId).not.toBe(key.keyId);
        expect(await f.invoke("namespace.keys.revoke", { ...credentials, keyId: nextKey.keyId })).toBeNull();
        expect(
            await f.invoke("secrets.delete", { ...credentials, secretId: created.secretId, expectedVersion: 2 }),
        ).toEqual({ deleted: true });
        expect(await f.invoke("namespace.delete", credentials)).toBeNull();
    } finally {
        f.close();
    }
});
