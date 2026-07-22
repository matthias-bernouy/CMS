import { describe, test, expect } from "bun:test";
import { InMemoryLocalCredentialStore } from "cms-auth/default-implementation/memory/InMemoryLocalCredentialStore";

const store = () => new InMemoryLocalCredentialStore();

describe("InMemoryLocalCredentialStore.create", () => {
    test("returns an identity and normalizes the email", async () => {
        const s = store();
        const id = await s.create({ email: "  A@X.com ", password: "pw" });
        expect(id.email).toBe("a@x.com");
        expect(id.sub).toBeTruthy();
        expect((await s.getByEmail("a@x.com"))?.emailVerifiedAt).toBeInstanceOf(Date);
    });

    test("rejects a duplicate email (case-insensitive)", async () => {
        const s = store();
        await s.create({ email: "a@x.com", password: "pw" });
        await expect(s.create({ email: "A@X.COM", password: "other" })).rejects.toThrow(/already registered/);
    });

    test("can create an unverified credential", async () => {
        const s = store();
        await s.create({ email: "a@x.com", password: "pw", emailVerified: false });
        expect((await s.getByEmail("a@x.com"))?.emailVerifiedAt).toBeNull();
    });
});

describe("InMemoryLocalCredentialStore.verify", () => {
    test("good password returns the credential identity", async () => {
        const s = store();
        await s.create({ email: "a@x.com", password: "pw" });
        const id = await s.verify("A@X.COM", "pw");
        expect(id?.email).toBe("a@x.com");
        expect(id).not.toHaveProperty("displayName");
    });

    test("wrong password → null", async () => {
        const s = store();
        await s.create({ email: "a@x.com", password: "pw" });
        expect(await s.verify("a@x.com", "nope")).toBeNull();
    });

    test("unknown email → null", async () => {
        expect(await store().verify("ghost@x.com", "pw")).toBeNull();
    });
});

describe("InMemoryLocalCredentialStore lifecycle", () => {
    test("setPassword changes the credential", async () => {
        const s = store();
        const id = await s.create({ email: "a@x.com", password: "old" });
        expect(await s.setPassword(id.sub, "new")).toBe(true);
        expect(await s.verify("a@x.com", "old")).toBeNull();
        expect(await s.verify("a@x.com", "new")).not.toBeNull();
    });

    test("markEmailVerified sets the verification timestamp", async () => {
        const s = store();
        const id = await s.create({ email: "a@x.com", password: "pw", emailVerified: false });
        expect(await s.markEmailVerified(id.sub)).toBe(true);
        expect((await s.getByEmail("a@x.com"))?.emailVerifiedAt).toBeInstanceOf(Date);
        expect(await s.markEmailVerified("missing")).toBe(false);
    });

    test("getByEmail returns the record without a hash; delete removes it", async () => {
        const s = store();
        const id = await s.create({ email: "a@x.com", password: "pw" });
        const rec = await s.getByEmail("A@X.com");
        expect(rec?.sub).toBe(id.sub);
        expect((rec as Record<string, unknown>).hash).toBeUndefined();
        expect(rec?.emailVerifiedAt).toBeInstanceOf(Date);
        expect(await s.delete(id.sub)).toBe(true);
        expect(await s.getByEmail("a@x.com")).toBeNull();
    });

    test("verify rejects an unverified credential even with the right password", async () => {
        const s = store();
        await s.create({ email: "a@x.com", password: "pw", emailVerified: false });
        expect(await s.verify("a@x.com", "pw")).toBeNull();
    });
});
