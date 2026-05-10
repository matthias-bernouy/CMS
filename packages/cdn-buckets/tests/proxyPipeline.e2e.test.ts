import { describe, test, expect } from "bun:test";
import { randomBytes } from "node:crypto";

import {
    EnvelopeSecretCrypto, LocalKekProvider,
    type DekRecord, type DekRepository,
} from "@bernouy/core";

import type { BucketProxy } from "src/interfaces/entities/BucketProxy";
import type { RulesConfig } from "src/interfaces/proxy/RulesConfig";
import type { BucketProxyRepository } from "src/interfaces/repositories/BucketProxyRepository";
import { renderProxyLocations } from "src/core/proxy/renderProxyLocations";
import { buildSecretsManifest } from "src/core/proxy/buildSecretsManifest";

/**
 * End-to-end coherence test for the Phase 3 proxy pipeline.
 *
 * Sets up the three pieces a real bucket proxy chain depends on:
 *   1. envelope encryption (LocalKek + InMemoryDek + EnvelopeSecretCrypto)
 *   2. an in-memory `BucketProxyRepository` that round-trips
 *      (encrypt at upsert, decrypt at list)
 *   3. the render + manifest builders
 *
 * Then checks the contract: every `${env:NAME}` placeholder emitted in
 * the rendered nginx fragment has a matching plaintext entry in the
 * manifest, and never leaks plaintext into the fragment.
 */

class InMemoryDekRepo implements DekRepository {
    private readonly _store = new Map<string, DekRecord>();
    async get(scopeId: string) { return this._store.get(scopeId) ?? null; }
    async upsert(d: DekRecord) { this._store.set(d.scopeId, d); }
    async delete(scopeId: string) { this._store.delete(scopeId); }
}

/** Mongo-shape repo: stores `secrets` encrypted, decrypts on read. */
class EncryptingProxyRepo implements BucketProxyRepository {
    private docs: Array<{
        bucketId: string; providerId: string; server: string; rules: RulesConfig;
        secrets: Record<string, { ciphertext: Buffer; iv: Buffer }>;
        createdAt: Date; updatedAt: Date;
    }> = [];

    constructor(private readonly _crypto: EnvelopeSecretCrypto) {}

    async upsert(p: BucketProxy): Promise<void> {
        const encrypted: Record<string, { ciphertext: Buffer; iv: Buffer }> = {};
        for (const [k, v] of Object.entries(p.secrets)) {
            const blob = await this._crypto.encrypt(p.bucketId, v);
            encrypted[k] = { ciphertext: blob.ciphertext, iv: blob.iv };
        }
        this.docs = this.docs.filter(d => !(d.bucketId === p.bucketId && d.providerId === p.providerId));
        this.docs.push({ ...p, secrets: encrypted });
    }
    async get(bucketId: string, providerId: string) {
        const doc = this.docs.find(d => d.bucketId === bucketId && d.providerId === providerId);
        return doc ? this._decryptOne(doc) : null;
    }
    async list(bucketId: string)  { return Promise.all(this.docs.filter(d => d.bucketId === bucketId).map(d => this._decryptOne(d))); }
    async listAll()               { return Promise.all(this.docs.map(d => this._decryptOne(d))); }
    async delete(bucketId: string, providerId: string) {
        this.docs = this.docs.filter(d => !(d.bucketId === bucketId && d.providerId === providerId));
    }
    async deleteByBucket(bucketId: string) {
        const before = this.docs.length;
        this.docs = this.docs.filter(d => d.bucketId !== bucketId);
        return before - this.docs.length;
    }

    private async _decryptOne(doc: typeof this.docs[number]): Promise<BucketProxy> {
        const secrets: Record<string, string> = {};
        for (const [k, blob] of Object.entries(doc.secrets)) {
            secrets[k] = await this._crypto.decrypt(doc.bucketId, blob);
        }
        return { ...doc, secrets };
    }
}

const SUPABASE_RULES: RulesConfig = {
    defaults: { on_request: [
        { type: "inject_header", name: "apikey", value: "${env:SUPABASE_ANON_KEY}" },
    ] },
    paths: {
        "/auth/v1/token": {
            methods: ["POST"],
            on_response: [
                { type: "extract_json", field: "access_token",
                  action: { type: "set_cookie", name: "sb-access-token", attributes: { max_age: 3600 } } },
                { type: "strip_body_fields", fields: ["access_token"] },
            ],
        },
        "/rest/v1/*": {
            on_request: [
                { type: "require_cookie", name: "sb-access-token",
                  on_missing: { type: "redirect", url: "/.cms/data/supabase/login?redirectTo={original_url}" } },
                { type: "cookie_to_header", cookie_name: "sb-access-token",
                  header_name: "Authorization", prefix: "Bearer " },
            ],
        },
    },
};

const PLAINTEXT_KEY = "sk_LIVE_PLAINTEXT_NEVER_LEAK";

async function makePipeline() {
    const crypto = new EnvelopeSecretCrypto(new LocalKekProvider(randomBytes(32)), new InMemoryDekRepo());
    const repo   = new EncryptingProxyRepo(crypto);
    const proxy: BucketProxy = {
        bucketId:   "tenant-a",
        providerId: "supabase",
        server:     "https://hnsutcetdsetjrubdhjl.supabase.co",
        rules:      SUPABASE_RULES,
        secrets:    { SUPABASE_ANON_KEY: PLAINTEXT_KEY },
        createdAt:  new Date(),
        updatedAt:  new Date(),
    };
    await repo.upsert(proxy);
    return { repo, proxy };
}

describe("Phase 3 — proxy pipeline E2E", () => {
    test("Mongo round-trip: encrypted at upsert, decrypted at list, plaintext recovered", async () => {
        const { repo } = await makePipeline();
        const all = await repo.listAll();
        expect(all).toHaveLength(1);
        expect(all[0]?.secrets["SUPABASE_ANON_KEY"]).toBe(PLAINTEXT_KEY);
    });

    test("Rendered nginx fragment NEVER contains plaintext", async () => {
        const { repo } = await makePipeline();
        const proxies = await repo.listAll();
        const nginx   = renderProxyLocations(proxies);
        expect(nginx).not.toContain(PLAINTEXT_KEY);
        expect(nginx).toContain('cms_secrets["SECRET_');
    });

    test("Manifest carries plaintext keyed by the SAME placeholder the nginx fragment references", async () => {
        const { repo } = await makePipeline();
        const proxies  = await repo.listAll();
        const nginx    = renderProxyLocations(proxies);
        const manifest = buildSecretsManifest(proxies);

        // Extract every SECRET_<HEX> referenced in the nginx fragment.
        const refs = new Set([...nginx.matchAll(/SECRET_[0-9A-F]{16}/g)].map(m => m[0]));
        expect(refs.size).toBeGreaterThan(0);

        // Every reference must have a matching manifest entry pointing at the plaintext.
        for (const ref of refs) {
            expect(manifest[ref]).toBe(PLAINTEXT_KEY);
        }
    });

    test("Defaults' ${env:…} are honored even when paths is empty", async () => {
        const crypto = new EnvelopeSecretCrypto(new LocalKekProvider(randomBytes(32)), new InMemoryDekRepo());
        const repo   = new EncryptingProxyRepo(crypto);
        await repo.upsert({
            bucketId: "b", providerId: "p", server: "https://api.example.com",
            rules: {
                defaults: { on_request: [
                    { type: "inject_header", name: "X-Tok", value: "${env:TOK}" },
                ] },
                paths: {},
            },
            secrets:   { TOK: "vvv" },
            createdAt: new Date(), updatedAt: new Date(),
        });
        const proxies  = await repo.listAll();
        const nginx    = renderProxyLocations(proxies);
        const manifest = buildSecretsManifest(proxies);
        // Fallback location alone — defaults applied to the catch-all.
        expect(nginx).toContain('proxy_set_header X-Tok "$cms_secret_');
        expect(Object.values(manifest)).toContain("vvv");
    });

    test("Adding a second proxy on the same bucket gets distinct placeholders, both plaintexts in manifest", async () => {
        const { repo } = await makePipeline();
        await repo.upsert({
            bucketId: "tenant-a", providerId: "stripe", server: "https://api.stripe.com",
            rules: {
                defaults: { on_request: [
                    { type: "inject_header", name: "Authorization", value: "Bearer ${env:STRIPE_KEY}" },
                ] },
                paths: {},
            },
            secrets:   { STRIPE_KEY: "sk_test_xxx" },
            createdAt: new Date(), updatedAt: new Date(),
        });
        const proxies  = await repo.listAll();
        const manifest = buildSecretsManifest(proxies);

        const values = Object.values(manifest).sort();
        expect(values).toEqual([PLAINTEXT_KEY, "sk_test_xxx"].sort());

        // Different env vars in different proxies → different placeholder names.
        expect(Object.keys(manifest).length).toBe(2);
    });
});
