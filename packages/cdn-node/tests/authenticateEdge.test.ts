import { describe, test, expect } from "bun:test";

import { authenticateEdge } from "../src/core/edge/authenticateEdge";
import { issueEdgeToken } from "../src/core/edge/issueEdgeToken";
import type { Edge } from "../src/interfaces/entities/Edge";
import type { EdgeRepository, EdgeProbeResult } from "../src/interfaces/repositories/EdgeRepository";

class InMemoryEdgeRepo implements EdgeRepository {
    private readonly _byHash = new Map<string, Edge>();
    seed(edge: Edge) { this._byHash.set(edge.tokenHash, edge); }
    async list()                    { return [...this._byHash.values()]; }
    async get(_id: string)          { return null; }
    async getByTokenHash(h: string) { return this._byHash.get(h) ?? null; }
    async create(_edge: Edge)       { /* unused */ }
    async update(_id: string)       { /* unused */ }
    async recordProbe(_id: string, _r: EdgeProbeResult) { /* unused */ }
    async delete(_id: string)       { /* unused */ }
}

const fakeEdge = (tokenHash: string): Edge => ({
    id: "e1", tokenHash, label: "e1", hostname: "h", sshUser: "u", sshPort: 22, dataPath: "/", notes: null,
    addedAt: 0, lastSeenAt: null, lastProbeAt: null, lastProbeOk: null, lastProbeError: null,
    lastProbeUsedBytes: null, lastProbeFileCount: null,
    lastProbeHttpOk: null, lastProbeHttpStatus: null, lastProbeHttpError: null,
});

describe("authenticateEdge", () => {
    test("returns null when no Authorization header", async () => {
        const repo = new InMemoryEdgeRepo();
        const out  = await authenticateEdge(new Request("http://x"), repo);
        expect(out).toBeNull();
    });

    test("returns null on a non-Bearer scheme", async () => {
        const repo = new InMemoryEdgeRepo();
        const req  = new Request("http://x", { headers: { Authorization: "Basic xxx" } });
        expect(await authenticateEdge(req, repo)).toBeNull();
    });

    test("returns null on unknown token", async () => {
        const repo = new InMemoryEdgeRepo();
        const req  = new Request("http://x", { headers: { Authorization: "Bearer bsedge_unknown" } });
        expect(await authenticateEdge(req, repo)).toBeNull();
    });

    test("returns the Edge when the token matches", async () => {
        const repo = new InMemoryEdgeRepo();
        const { plaintext, hash } = issueEdgeToken();
        repo.seed(fakeEdge(hash));
        const req = new Request("http://x", { headers: { Authorization: `Bearer ${plaintext}` } });
        const edge = await authenticateEdge(req, repo);
        expect(edge?.id).toBe("e1");
    });

    test("Authorization header is case-insensitive", async () => {
        const repo = new InMemoryEdgeRepo();
        const { plaintext, hash } = issueEdgeToken();
        repo.seed(fakeEdge(hash));
        const req = new Request("http://x", { headers: { authorization: `Bearer ${plaintext}` } });
        const edge = await authenticateEdge(req, repo);
        expect(edge?.id).toBe("e1");
    });
});
