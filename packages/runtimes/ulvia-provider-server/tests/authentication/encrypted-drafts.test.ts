import { expect, test } from "bun:test";
import { BSON, type Db } from "mongodb";
import { createHash } from "node:crypto";
import { encryptAesGcm, decryptAesGcm, type SecretCrypto } from "@bernouy/envelope-crypto";
import type { PendingProviderConnection } from "@bernouy/cms-repository/providers/management";
import { EncryptedConnectionDrafts } from "../../src/runtime/gateway/providers/connections/EncryptedConnectionDrafts";

test("encrypted connection drafts survive a real BSON round trip and remain bound to their instance", async () => {
    const documents = new Map<string, Uint8Array>();
    const collection = {
        createIndex: async () => undefined,
        countDocuments: async () => documents.size,
        updateOne: async (filter: { _id: string }, update: { $set: object }) => {
            documents.set(filter._id, BSON.serialize({ _id: filter._id, ...update.$set }));
        },
        findOne: async (filter: { _id: string; expiresAt?: { $gt: Date } }) => {
            const bytes = documents.get(filter._id);
            const value = bytes ? BSON.deserialize(bytes) : undefined;
            return value && (!filter.expiresAt || value.expiresAt > filter.expiresAt.$gt) ? value : null;
        },
        deleteOne: async (filter: { _id: string }) => {
            documents.delete(filter._id);
        },
    };
    const db = { collection: () => collection } as unknown as Db;
    const key = (scope: string) => createHash("sha256").update(scope).digest();
    const crypto: SecretCrypto = {
        encrypt: async (scope, value) => encryptAesGcm(value, key(scope)),
        decrypt: async (scope, blob) => decryptAesGcm(blob, key(scope)).toString(),
    };
    const draft = {
        token: "private-provider-credential",
        actorId: "admin-a",
        createdAt: Date.now(),
        preparation: { operation: "approve", candidate: { id: "provider-a" } },
    } as PendingProviderConnection;
    const store = new EncryptedConnectionDrafts(db, crypto, "instance-a");
    await store.init();
    await store.set("ticket", draft);
    expect(Buffer.from(documents.get("ticket")!).includes(Buffer.from(draft.token))).toBe(false);
    expect(await new EncryptedConnectionDrafts(db, crypto, "instance-a").get("ticket")).toEqual(draft);
    await expect(new EncryptedConnectionDrafts(db, crypto, "instance-b").get("ticket")).rejects.toThrow();
    await store.set("expired", { ...draft, createdAt: Date.now() - 300_001 });
    expect(await store.get("expired")).toBeUndefined();
    await store.delete("ticket");
    expect(await store.get("ticket")).toBeUndefined();
});
