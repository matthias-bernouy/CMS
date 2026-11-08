import { expect, test } from "bun:test";
import { joinedFixture } from "./fixture";

for (const permission of ["secrets.metadata.read", "secrets.resolve"] as const) {
    test(`a joined snapshot cannot grant missing ${permission} permission`, async () => {
        const f = await joinedFixture();
        const key = await f.secrets.createNamespaceKey({
            namespaceId: f.owner.namespaceId,
            namespaceKey: f.owner.namespaceKey,
            permissions: [permission === "secrets.resolve" ? "secrets.metadata.read" : "secrets.resolve"],
        });
        await expect(f.read(key.namespaceKey)).rejects.toThrow();
        expect(f.stats.plaintextReads).toBe(0);
    });
}

test("joined resolution authenticates the actual key and never decrypts another namespace", async () => {
    const f = await joinedFixture();
    await expect(f.read(f.owner.namespaceKey + "invalid")).rejects.toThrow();
    await expect(f.read(f.owner.namespaceKey, f.other.namespaceId)).rejects.toThrow("does not exist");
    f.rewrite = (value) => ({ ...value, key: value.key ? { ...value.key, id: "snk_another" } : null });
    await expect(f.read()).rejects.toThrow();
    expect(f.stats.plaintextReads).toBe(0);
});

test("joined resolution refuses expired and revoked keys without using plaintext", async () => {
    const f = await joinedFixture();
    const consumer = await f.secrets.createNamespaceKey({
        namespaceId: f.owner.namespaceId,
        namespaceKey: f.owner.namespaceKey,
        permissions: ["secrets.metadata.read", "secrets.resolve"],
        expiresAt: new Date("2026-10-29T10:00:01Z"),
    });
    expect((await f.read(consumer.namespaceKey))?.value).toBe("initial");
    f.now = new Date("2026-10-29T10:00:01Z");
    await expect(f.read(consumer.namespaceKey)).rejects.toThrow();
    await f.secrets.revokeNamespaceKey(f.owner.namespaceId, f.owner.namespaceKey, consumer.keyId);
    await expect(f.read(consumer.namespaceKey)).rejects.toThrow();
    expect(f.stats.plaintextReads).toBe(1);
});

test("metadata ownership and name are checked independently from the joined reader", async () => {
    const f = await joinedFixture();
    for (const patch of [{ namespaceId: f.other.namespaceId }, { name: "another" }]) {
        f.rewrite = (value) => ({ ...value, metadata: value.metadata ? { ...value.metadata, ...patch } : null });
        await expect(f.read()).rejects.toThrow("does not exist");
    }
    expect(f.stats.plaintextReads).toBe(0);
});
