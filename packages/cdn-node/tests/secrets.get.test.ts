import { describe, test, expect } from "bun:test";

import handler from "../src/api/edge/secrets.get";
import { issueEdgeToken } from "../src/core/edge/issueEdgeToken";
import type { OriginProvider } from "../src/exports/OriginProvider";
import type { Edge } from "../src/interfaces/entities/Edge";
import type { EdgeRepository, EdgeProbeResult } from "../src/interfaces/repositories/EdgeRepository";
import type { BucketProxy, BucketProxyRepository } from "@bernouy/cdn-buckets";

class FakeEdgeRepo implements EdgeRepository {
    private _byHash = new Map<string, Edge>();
    seed(e: Edge) { this._byHash.set(e.tokenHash, e); }
    async list()                    { return [...this._byHash.values()]; }
    async get(_id: string)          { return null; }
    async getByTokenHash(h: string) { return this._byHash.get(h) ?? null; }
    async create(_e: Edge)          { /* unused */ }
    async update(_id: string)       { /* unused */ }
    async recordProbe(_id: string, _r: EdgeProbeResult) { /* unused */ }
    async delete(_id: string)       { /* unused */ }
}

class FakeProxyRepo implements BucketProxyRepository {
    public proxies: BucketProxy[] = [];
    async listAll() { return this.proxies; }
    async list(b: string) { return this.proxies.filter((p) => p.bucketId === b); }
    async get() { return null; }
    async upsert(_p: BucketProxy) {}
    async delete() {}
    async deleteByBucket() { return 0; }
}

const edge = (hash: string): Edge => ({
    id: "e1", tokenHash: hash, label: "e1", hostname: "h", sshUser: "u", sshPort: 22, dataPath: "/", notes: null,
    addedAt: 0, lastSeenAt: null, lastProbeAt: null, lastProbeOk: null, lastProbeError: null,
    lastProbeUsedBytes: null, lastProbeFileCount: null,
    lastProbeHttpOk: null, lastProbeHttpStatus: null, lastProbeHttpError: null,
});

const proxy = (overrides: Partial<BucketProxy> = {}): BucketProxy => ({
    bucketId: "b1", providerId: "stripe", server: "https://api.stripe.com/v1",
    rules: {
        defaults: { on_request: [
            { type: "inject_header", name: "Authorization", value: "Bearer ${env:TOK}" },
        ] },
        paths: {},
    },
    secrets: { TOK: "T1" },
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
});

const makeProvider = (edgeRepo: EdgeRepository, bucketProxyRepo: BucketProxyRepository): OriginProvider =>
    ({ edgeRepo, bucketProxyRepo } as unknown as OriginProvider);

const url = "http://origin/edge-api/secrets";

describe("GET /edge-api/secrets", () => {
    test("401 without token", async () => {
        const res = await handler(new Request(url), makeProvider(new FakeEdgeRepo(), new FakeProxyRepo()));
        expect(res.status).toBe(401);
    });

    test("401 with unknown token", async () => {
        const res = await handler(
            new Request(url, { headers: { Authorization: "Bearer bsedge_unknown" } }),
            makeProvider(new FakeEdgeRepo(), new FakeProxyRepo()),
        );
        expect(res.status).toBe(401);
    });

    test("200 with valid token, body shape correct, ETag header set", async () => {
        const repo = new FakeEdgeRepo();
        const { plaintext, hash } = issueEdgeToken();
        repo.seed(edge(hash));
        const proxyRepo = new FakeProxyRepo();
        proxyRepo.proxies = [proxy()];

        const res = await handler(
            new Request(url, { headers: { Authorization: `Bearer ${plaintext}` } }),
            makeProvider(repo, proxyRepo),
        );
        expect(res.status).toBe(200);
        const etag = res.headers.get("etag");
        expect(etag).toMatch(/^"[0-9a-f]{32}"$/);

        const body = await res.json() as { etag: string; manifest: Record<string, string> };
        expect(body.etag).toBe(etag!.replace(/^"|"$/g, ""));
        expect(Object.keys(body.manifest)).toHaveLength(1);
    });

    test("304 when If-None-Match matches the current etag", async () => {
        const repo = new FakeEdgeRepo();
        const { plaintext, hash } = issueEdgeToken();
        repo.seed(edge(hash));
        const proxyRepo = new FakeProxyRepo();
        proxyRepo.proxies = [proxy()];
        const provider = makeProvider(repo, proxyRepo);

        const first = await handler(
            new Request(url, { headers: { Authorization: `Bearer ${plaintext}` } }),
            provider,
        );
        const etag = first.headers.get("etag")!;

        const second = await handler(
            new Request(url, { headers: { Authorization: `Bearer ${plaintext}`, "If-None-Match": etag } }),
            provider,
        );
        expect(second.status).toBe(304);
        expect(second.headers.get("etag")).toBe(etag);
    });

    test("200 when If-None-Match doesn't match", async () => {
        const repo = new FakeEdgeRepo();
        const { plaintext, hash } = issueEdgeToken();
        repo.seed(edge(hash));
        const proxyRepo = new FakeProxyRepo();
        proxyRepo.proxies = [proxy()];

        const res = await handler(
            new Request(url, { headers: { Authorization: `Bearer ${plaintext}`, "If-None-Match": '"deadbeef"' } }),
            makeProvider(repo, proxyRepo),
        );
        expect(res.status).toBe(200);
    });
});
