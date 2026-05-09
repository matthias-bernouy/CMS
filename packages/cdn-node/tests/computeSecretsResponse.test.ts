import { describe, test, expect } from "bun:test";

import { computeSecretsResponse } from "../src/core/edge/computeSecretsResponse";
import type { BucketProxy, BucketProxyRepository } from "@bernouy/cdn-buckets";

class InMemoryProxyRepo implements BucketProxyRepository {
    public proxies: BucketProxy[] = [];
    async listAll() { return this.proxies; }
    async list(b: string) { return this.proxies.filter((p) => p.bucketId === b); }
    async get(_b: string, _p: string) { return null; }
    async upsert(_p: BucketProxy) {}
    async delete(_b: string, _p: string) {}
    async deleteByBucket(_b: string) { return 0; }
}

const proxy = (overrides: Partial<BucketProxy>): BucketProxy => ({
    bucketId:   "b1",
    providerId: "stripe",
    server:     "https://api.stripe.com/v1",
    auth:       { type: "bearer", token: "T1" },
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
        repoA.proxies = [proxy({ providerId: "stripe" }), proxy({ providerId: "weather", auth: { type: "bearer", token: "T2" } })];
        repoB.proxies = [proxy({ providerId: "weather", auth: { type: "bearer", token: "T2" } }), proxy({ providerId: "stripe" })];
        const a = await computeSecretsResponse(repoA);
        const b = await computeSecretsResponse(repoB);
        expect(a.etag).toBe(b.etag);
    });
});
