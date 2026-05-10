import { describe, test, expect } from "bun:test";
import { randomBytes } from "node:crypto";

import { EnvelopeSecretCrypto, LocalKekProvider, type DekRecord, type DekRepository } from "@bernouy/core";

class InMemoryDekRepo implements DekRepository {
    private readonly _store = new Map<string, DekRecord>();
    public upserts = 0;
    public gets    = 0;

    async get(scopeId: string)    { this.gets++; return this._store.get(scopeId) ?? null; }
    async upsert(d: DekRecord)    { this.upserts++; this._store.set(d.scopeId, d); }
    async delete(scopeId: string) { this._store.delete(scopeId); }
}

const provider = () => new LocalKekProvider(randomBytes(32));

describe("EnvelopeSecretCrypto", () => {
    test("creates a DEK on first encrypt, reuses on subsequent", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(provider(), repo);
        await crypto.encrypt("b1", "secret-1");
        await crypto.encrypt("b1", "secret-2");
        expect(repo.upserts).toBe(1);
    });

    test("roundtrips bearer token", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(provider(), repo);
        const blob = await crypto.encrypt("b1", "sk_live_abcdef");
        const back = await crypto.decrypt("b1", blob);
        expect(back).toBe("sk_live_abcdef");
    });

    test("decrypt fails on a different scope — DEKs are per-scope", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(provider(), repo);
        const blob = await crypto.encrypt("a", "secret");
        expect(crypto.decrypt("b", blob)).rejects.toThrow();
    });

    test("decrypt fails when the DEK row was wiped", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(provider(), repo, { ttlMs: 0 });
        const blob = await crypto.encrypt("b1", "secret");
        await repo.delete("b1");
        expect(crypto.decrypt("b1", blob)).rejects.toThrow(/no DEK/);
    });

    test("cache hit avoids the repo round-trip", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(provider(), repo);
        await crypto.encrypt("b1", "x");
        const before = repo.gets;
        await crypto.encrypt("b1", "y");
        await crypto.encrypt("b1", "z");
        expect(repo.gets).toBe(before);
    });

    test("concurrent encrypts on a fresh scope only create one DEK", async () => {
        const repo   = new InMemoryDekRepo();
        const crypto = new EnvelopeSecretCrypto(provider(), repo);
        await Promise.all([
            crypto.encrypt("b1", "1"),
            crypto.encrypt("b1", "2"),
            crypto.encrypt("b1", "3"),
        ]);
        expect(repo.upserts).toBe(1);
    });
});
