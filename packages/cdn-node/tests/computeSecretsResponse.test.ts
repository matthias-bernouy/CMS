import { describe, test, expect } from "bun:test";

import { computeSecretsResponse } from "../src/core/edge/computeSecretsResponse";
import type { BucketProxy, BucketProxyRepository, RulesConfig } from "@bernouy/cdn-buckets";

class InMemoryProxyRepo implements BucketProxyRepository {
    public proxies: BucketProxy[] = [];
    async listAll() { return this.proxies; }
    async list(b: string) { return this.proxies.filter((p) => p.bucketId === b); }
    async get(_b: string, _p: string) { return null; }
    async upsert(_p: BucketProxy) {}
    async delete(_b: string, _p: string) {}
    async deleteByBucket(_b: string) { return 0; }
}

const bearerRules = (envName = "TOK"): RulesConfig => ({
    defaults: { on_request: [
        { type: "inject_header", name: "Authorization", value: `Bearer \${env:${envName}}` },
    ] },
    paths: {},
});

const proxy = (overrides: Partial<BucketProxy>): BucketProxy => ({
    bucketId:   "b1",
    providerId: "stripe",
    server:     "https://api.stripe.com/v1",
    rules:      bearerRules(),
    secrets:    { TOK: "T1" },
    createdAt:  new Date(),
    updatedAt:  new Date(),
    ...overrides,
});

describe("computeSecretsResponse", () => {
    test("empty proxies → empty manifest, stable etag", async () => {
        const repo = new InMemoryProxyRepo();
        const a = await computeSecretsResponse(repo);
        const b = await computeSecretsResponse(repo);
        expect(Object.keys(a.manifest)).toHaveLength(0);
        expect(a.etag).toBe(b.etag);
    });

    test("adding a proxy changes the etag", async () => {
        const repo = new InMemoryProxyRepo();
        const before = await computeSecretsResponse(repo);
        repo.proxies = [proxy({})];
        const after  = await computeSecretsResponse(repo);
        expect(after.etag).not.toBe(before.etag);
        expect(Object.keys(after.manifest)).toHaveLength(1);
    });

    test("etag is deterministic regardless of proxy insertion order", async () => {
        const repoA = new InMemoryProxyRepo();
        const repoB = new InMemoryProxyRepo();
        const stripe  = proxy({ providerId: "stripe",  secrets: { TOK: "T1" } });
        const weather = proxy({ providerId: "weather", secrets: { TOK: "T2" } });
        repoA.proxies = [stripe, weather];
        repoB.proxies = [weather, stripe];
        const a = await computeSecretsResponse(repoA);
        const b = await computeSecretsResponse(repoB);
        expect(a.etag).toBe(b.etag);
    });
});
