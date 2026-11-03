import { describe, test, expect } from "bun:test";
import { InMemoryPatRepository } from "cms-auth/tokens/personal-access/default-implementation/memory/InMemoryPatRepository";
import { MAX_PERSONAL_ACCESS_TOKENS, PersonalAccessTokenLimitError, personalAccessTokenInput } from "@bernouy/cms-auth";

const repo = () => new InMemoryPatRepository();

describe("InMemoryPatRepository", () => {
    test("create → verify roundtrip yields the bound principal", async () => {
        const r = repo();
        const { token, pat } = await r.create({ sub: "u1", name: "cli" });
        expect(token.startsWith("pat_")).toBe(true);
        expect(pat.sub).toBe("u1");
        const principal = await r.verify(token);
        expect(principal).toEqual({ sub: "u1" });
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
        expect(await r.revoke("u1", pat.id)).toBe(true);
        expect(await r.verify(token)).toBeNull();
        expect(await r.revoke("u1", pat.id)).toBe(false);
    });

    test("revoke is scoped to the owner sub", async () => {
        const r = repo();
        const { token, pat } = await r.create({ sub: "u1", name: "cli" });
        expect(await r.revoke("u2", pat.id)).toBe(false);
        expect(await r.verify(token)).toEqual({ sub: "u1" });
    });

    test("list is scoped to the owner sub", async () => {
        const r = repo();
        await r.create({ sub: "u1", name: "a" });
        await r.create({ sub: "u2", name: "b" });
        expect((await r.list("u1")).length).toBe(1);
        expect((await r.list("u2")).length).toBe(1);
        expect((await r.list("u3")).length).toBe(0);
    });

    test("concurrent creation is bounded per account and revocation frees a slot", async () => {
        const r = repo();
        const results = await Promise.allSettled(
            Array.from({ length: MAX_PERSONAL_ACCESS_TOKENS + 4 }, () => r.create({ sub: "u1", name: "cli" })),
        );
        expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(MAX_PERSONAL_ACCESS_TOKENS);
        for (const result of results) {
            if (result.status === "rejected") {
                expect(result.reason).toBeInstanceOf(PersonalAccessTokenLimitError);
            }
        }
        expect(await r.list("u1")).toHaveLength(MAX_PERSONAL_ACCESS_TOKENS);
        await r.create({ sub: "u2", name: "independent quota" });
        expect(await r.revoke("u2", (await r.list("u1"))[0]!.id)).toBe(false);
        await r.revoke("u1", (await r.list("u1"))[0]!.id);
        await r.create({ sub: "u1", name: "replacement" });
        expect(await r.list("u1")).toHaveLength(MAX_PERSONAL_ACCESS_TOKENS);
    });

    test("metadata dates cannot mutate stored token expiry", async () => {
        const r = repo();
        const expiry = new Date(Date.now() + 60_000);
        const created = await r.create({ sub: "u1", name: "cli", expiresAt: expiry });
        expiry.setTime(0);
        created.pat.expiresAt!.setTime(0);
        (await r.list("u1"))[0]!.expiresAt!.setTime(0);
        expect(await r.verify(created.token)).toEqual({ sub: "u1" });
    });
});

test("PAT creation input rejects owner injection, invalid labels and invalid expiry", () => {
    expect(personalAccessTokenInput({ name: " CLI " })).toEqual({ name: "CLI", expiresAt: null });
    for (const input of [
        { name: "" },
        { name: "x".repeat(101) },
        { name: "CLI", sub: "someone-else" },
        { name: "CLI", expiresAt: "invalid" },
        { name: "CLI", expiresAt: "2000-01-01T00:00:00.000Z" },
    ]) {
        expect(() => personalAccessTokenInput(input)).toThrow();
    }
});
