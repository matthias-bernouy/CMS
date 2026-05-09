import { describe, test, expect } from "bun:test";
import { randomBytes } from "node:crypto";

import { EnvelopeSecretCrypto } from "src/default-implementation/EnvelopeSecretCrypto";
import type { BucketDek } from "src/interfaces/entities/BucketDek";
import type { BucketDekRepository } from "src/interfaces/repositories/BucketDekRepository";

class InMemoryDekRepo implements BucketDekRepository {
    private readonly _store = new Map<string, BucketDek>();
    public upserts = 0;
    public gets    = 0;

    async get(bucketId: string)    { this.gets++; return this._store.get(bucketId) ?? null; }
    async upsert(d: BucketDek)     { this.upserts++; this._store.set(d.bucketId, d); }
    async delete(bucketId: string) { this._store.delete(bucketId); }
}

describe("EnvelopeSecretCrypto", () => {
    test("creates a DEK on first encrypt, reuses on subsequent", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(randomBytes(32), repo);
        await crypto.encryptForBucket("b1", "secret-1");
        await crypto.encryptForBucket("b1", "secret-2");
        expect(repo.upserts).toBe(1);
    });

    test("roundtrips bearer token", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(randomBytes(32), repo);
        const blob = await crypto.encryptForBucket("b1", "sk_live_abcdef");
        const back = await crypto.decryptForBucket("b1", blob);
        expect(back).toBe("sk_live_abcdef");
    });

    test("decrypt fails on a different bucket — DEKs are per-bucket", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(randomBytes(32), repo);
        const blob = await crypto.encryptForBucket("a", "secret");
        expect(crypto.decryptForBucket("b", blob)).rejects.toThrow();
    });

    test("decrypt fails when the DEK row was wiped", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(randomBytes(32), repo, { ttlMs: 0 });
        const blob = await crypto.encryptForBucket("b1", "secret");
        await repo.delete("b1");
        expect(crypto.decryptForBucket("b1", blob)).rejects.toThrow(/no DEK/);
    });

    test("cache hit avoids the repo round-trip", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(randomBytes(32), repo);
        await crypto.encryptForBucket("b1", "x");
        const before = repo.gets;
        await crypto.encryptForBucket("b1", "y");
        await crypto.encryptForBucket("b1", "z");
        expect(repo.gets).toBe(before);
    });

    test("concurrent encrypts on a fresh bucket only create one DEK", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(randomBytes(32), repo);
        await Promise.all([
            crypto.encryptForBucket("b1", "1"),
            crypto.encryptForBucket("b1", "2"),
            crypto.encryptForBucket("b1", "3"),
        ]);
        expect(repo.upserts).toBe(1);
    });
});
