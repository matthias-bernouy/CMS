import { describe, test, expect } from "bun:test";
import { InMemoryLocalCredentialStore } from "cms-auth/default-implementation/InMemoryLocalCredentialStore";

const store = () => new InMemoryLocalCredentialStore();

describe("InMemoryLocalCredentialStore.create", () => {
    test("returns an identity and normalizes the email", async () => {
        const id = await store().create({ email: "  A@X.com ", password: "pw" });
        expect(id.email).toBe("a@x.com");
        expect(id.sub).toBeTruthy();
    });

    test("rejects a duplicate email (case-insensitive)", async () => {
        const s = store();
        await s.create({ email: "a@x.com", password: "pw" });
        await expect(s.create({ email: "A@X.COM", password: "other" })).rejects.toThrow(/already registered/);
    });
});

describe("InMemoryLocalCredentialStore.verify", () => {
    test("good password → identity WITHOUT a fabricated displayName", async () => {
        const s = store();
        await s.create({ email: "a@x.com", password: "pw", displayName: "Bob" });
        const id = await s.verify("A@X.COM", "pw");
        expect(id?.email).toBe("a@x.com");
        expect(id?.displayName).toBeUndefined(); // must not clobber the stored displayName on login
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

    test("getByEmail returns the record without a hash; delete removes it", async () => {
        const s = store();
        const id = await s.create({ email: "a@x.com", password: "pw" });
        const rec = await s.getByEmail("A@X.com");
        expect(rec?.sub).toBe(id.sub);
        expect((rec as Record<string, unknown>).hash).toBeUndefined();
        expect(await s.delete(id.sub)).toBe(true);
        expect(await s.getByEmail("a@x.com")).toBeNull();
    });
});
