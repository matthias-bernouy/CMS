import { describe, test, expect } from "bun:test";
import { randomBytes } from "node:crypto";

import { EnvelopeSecretCrypto, LocalKekProvider, type DekRecord, type DekRepository } from "@bernouy/core";
import { encryptProxyAuth, decryptProxyAuth, type ProxyAuthDoc } from "src/core/proxy/proxyAuthCrypto";
import type { ProxyAuth } from "src/interfaces/entities/BucketProxy";

class InMemoryDekRepo implements DekRepository {
    private readonly _store = new Map<string, DekRecord>();
    async get(scopeId: string)    { return this._store.get(scopeId) ?? null; }
    async upsert(d: DekRecord)    { this._store.set(d.scopeId, d); }
    async delete(scopeId: string) { this._store.delete(scopeId); }
}

const cryptoFor = () => new EnvelopeSecretCrypto(new LocalKekProvider(randomBytes(32)), new InMemoryDekRepo());

describe("proxyAuthCrypto", () => {
    test("roundtrips type=none unchanged", async () => {
        const c = cryptoFor();
        const doc = await encryptProxyAuth("b1", { type: "none" }, c);
        const back = await decryptProxyAuth("b1", doc, c);
        expect(back).toEqual({ type: "none" });
    });

    test("roundtrips type=bearer with the original token", async () => {
        const c = cryptoFor();
        const original: ProxyAuth = { type: "bearer", token: "sk_live_abc" };
        const doc = await encryptProxyAuth("b1", original, c);
        expect((doc as Extract<ProxyAuthDoc, { type: "bearer" }>).encryptedToken.length).toBeGreaterThan(0);
        const back = await decryptProxyAuth("b1", doc, c);
        expect(back).toEqual(original);
    });

    test("roundtrips type=headers preserving header order", async () => {
        const c = cryptoFor();
        const original: ProxyAuth = {
            type: "headers",
            headers: [
                { name: "X-API-Key",     value: "abc123" },
                { name: "Authorization", value: "Basic xyz" },
            ],
        };
        const doc = await encryptProxyAuth("b1", original, c);
        const back = await decryptProxyAuth("b1", doc, c);
        expect(back).toEqual(original);
    });

    test("encrypted document NEVER contains the plaintext token", async () => {
        const c = cryptoFor();
        const original: ProxyAuth = { type: "bearer", token: "VERY_SECRET_TOKEN" };
        const doc = await encryptProxyAuth("b1", original, c);
        const dump = JSON.stringify(doc, (_k, v) => Buffer.isBuffer(v) ? v.toString("hex") : v);
        expect(dump).not.toContain("VERY_SECRET_TOKEN");
    });

    test("a bucket cannot decrypt another bucket's proxy auth", async () => {
        const c = cryptoFor();
        const doc = await encryptProxyAuth("a", { type: "bearer", token: "x" }, c);
        expect(decryptProxyAuth("b", doc, c)).rejects.toThrow();
    });

    test("repeating an encrypt for the same plaintext produces a fresh ciphertext", async () => {
        const c = cryptoFor();
        const auth: ProxyAuth = { type: "bearer", token: "x" };
        const a = await encryptProxyAuth("b1", auth, c) as Extract<ProxyAuthDoc, { type: "bearer" }>;
        const b = await encryptProxyAuth("b1", auth, c) as Extract<ProxyAuthDoc, { type: "bearer" }>;
        expect(a.iv.equals(b.iv)).toBe(false);
        expect(a.encryptedToken.equals(b.encryptedToken)).toBe(false);
    });
});
