import { describe, test, expect } from "bun:test";
import { InMemoryPatRepository } from "cms-auth/default-implementation/InMemoryPatRepository";

const repo = () => new InMemoryPatRepository();

describe("InMemoryPatRepository", () => {
    test("create → verify roundtrip yields the bound principal", async () => {
        const r = repo();
        const { token, pat } = await r.create({ sub: "u1", name: "cli" });
        expect(token.startsWith("pat_")).toBe(true);
        expect(pat.sub).toBe("u1");
        const principal = await r.verify(token);
        expect(principal).toEqual({ sub: "u1", scopes: [] });
    });

    test("verify of an unknown token → null", async () => {
        expect(await repo().verify("pat_bogus")).toBeNull();
    });

    test("expired token → null", async () => {
        const r = repo();
        const { token } = await r.create({ sub: "u1", name: "old", expiresAt: new Date(Date.now() - 1000) });
        expect(await r.verify(token)).toBeNull();
    });

    test("revoke makes the token unusable", async () => {
        const r = repo();
        const { token, pat } = await r.create({ sub: "u1", name: "cli" });
        expect(await r.revoke(pat.id)).toBe(true);
        expect(await r.verify(token)).toBeNull();
        expect(await r.revoke(pat.id)).toBe(false);
    });

    test("list is scoped to the owner sub", async () => {
        const r = repo();
        await r.create({ sub: "u1", name: "a" });
        await r.create({ sub: "u2", name: "b" });
        expect((await r.list("u1")).length).toBe(1);
        expect((await r.list("u2")).length).toBe(1);
        expect((await r.list("u3")).length).toBe(0);
    });
});
