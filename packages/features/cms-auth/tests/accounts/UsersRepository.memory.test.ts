import { describe, test, expect } from "bun:test";
import { InMemoryUsersRepository } from "cms-auth/accounts/default-implementation/memory/InMemoryUsersRepository";

const repo = () => new InMemoryUsersRepository();

describe("InMemoryUsersRepository.upsert", () => {
    test("creates a member on first insert", async () => {
        const r = repo();
        const u = await r.upsert({ sub: "s1", email: "a@x.com" });
        expect(u.email).toBe("a@x.com");
        expect(u.createdAt).toBeInstanceOf(Date);
    });

    test("only updates fields the identity carries (no clobber to undefined)", async () => {
        const r = repo();
        await r.upsert({ sub: "s1", email: "a@x.com" });
        await r.upsert({ sub: "s1" }); // re-login without email
        const u = await r.getBySub("s1");
        expect(u?.email).toBe("a@x.com");
    });
});

describe("InMemoryUsersRepository basic ops", () => {
    test("getBySub returns null for unknown", async () => {
        expect(await repo().getBySub("nope")).toBeNull();
    });

    test("delete removes the user", async () => {
        const r = repo();
        await r.upsert({ sub: "s1" });
        expect(await r.delete("s1")).toBe(true);
        expect(await r.getBySub("s1")).toBeNull();
        expect(await r.delete("s1")).toBe(false);
    });
});

describe("InMemoryUsersRepository.list", () => {
    async function seeded() {
        const r = repo();
        await r.upsert({ sub: "s1", email: "alice@x.com" });
        await r.upsert({ sub: "s2", email: "bob@x.com" });
        await r.upsert({ sub: "s3", email: "carol@x.com" });
        return r;
    }

    test("search is an EXACT (case-insensitive) email match, not substring", async () => {
        const r = await seeded();
        expect((await r.list({ search: "ALICE@X.COM" })).total).toBe(1);
        expect((await r.list({ search: "alice" })).total).toBe(0); // no substring
    });

    test("sorts by createdAt and paginates with hasMore", async () => {
        const r = await seeded();
        const page1 = await r.list({ sortBy: "createdAt", sortOrder: "asc", pagination: { page: 1, limit: 2 } });
        expect(page1.users.length).toBe(2);
        expect(page1.hasMore).toBe(true);
        const page2 = await r.list({ pagination: { page: 2, limit: 2 } });
        expect(page2.users.length).toBe(1);
        expect(page2.hasMore).toBe(false);
    });
});
