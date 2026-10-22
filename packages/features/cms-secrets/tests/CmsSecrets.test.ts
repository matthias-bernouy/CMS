import { describe, expect, test } from "bun:test";
import { CmsSecretConflict, CmsSecretNotFound, CmsSecrets } from "@bernouy/cms-secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/cms-secrets/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";

describe("CmsSecrets", () => {
    test("stores values outside public metadata and resolves them by id", async () => {
        const secrets = fixture();

        const created = await secrets.create("payment-token", "first-value");

        expect(created).toEqual({
            secretId: "secret-id",
            name: "payment-token",
            version: 1,
            createdAt: "2026-10-22T10:00:00.000Z",
            rotatedAt: null,
        });
        expect(JSON.stringify(await secrets.get(created.secretId))).not.toContain("first-value");
        expect(await secrets.resolve(created.secretId)).toEqual({
            secretId: "secret-id",
            version: 1,
            value: "first-value",
        });
    });

    test("rotates with optimistic version control", async () => {
        const secrets = fixture();
        const created = await secrets.create("payment-token", "first-value");

        const rotated = await secrets.rotate(created.secretId, 1, "second-value");

        expect(rotated.version).toBe(2);
        expect(await secrets.resolve(created.secretId)).toMatchObject({ version: 2, value: "second-value" });
        await expect(secrets.rotate(created.secretId, 1, "stale-value")).rejects.toBeInstanceOf(CmsSecretConflict);
        expect(await secrets.resolve(created.secretId)).toMatchObject({ version: 2, value: "second-value" });
    });

    test("deletes metadata and encrypted value together", async () => {
        const secrets = fixture();
        const created = await secrets.create("payment-token", "value");

        expect(await secrets.delete(created.secretId, 1)).toBe(true);
        await expect(secrets.resolve(created.secretId)).rejects.toBeInstanceOf(CmsSecretNotFound);
        expect(await secrets.delete(created.secretId, 1)).toBe(false);
    });

    test("rejects duplicate names", async () => {
        const secrets = fixture();
        await secrets.create("payment-token", "first");

        await expect(secrets.create("payment-token", "second")).rejects.toBeInstanceOf(CmsSecretConflict);
    });
});

function fixture(): CmsSecrets {
    return new CmsSecrets(
        new InMemoryCmsSecretMetadataStore(),
        new InMemorySecretStore(),
        () => "secret-id",
        () => new Date("2026-10-22T10:00:00.000Z"),
    );
}
