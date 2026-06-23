import { describe, test, expect } from "bun:test";
import { InMemoryAuthTokenStore } from "cms-auth/default-implementation/memory/InMemoryAuthTokenStore";

const store = () => new InMemoryAuthTokenStore();
const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

describe("InMemoryAuthTokenStore", () => {
    test("create returns a plaintext token once and stores no public hash", async () => {
        const s = store();
        const { token, authToken } = await s.create({
            purpose: "email_verification",
            sub: "local:u1",
            expiresAt: future(),
        });

        expect(token.startsWith("auth_")).toBe(true);
        expect(authToken.sub).toBe("local:u1");
        expect(authToken.purpose).toBe("email_verification");
        expect(authToken.consumedAt).toBeNull();
        expect((authToken as Record<string, unknown>).hash).toBeUndefined();
        expect((authToken as Record<string, unknown>).email).toBeUndefined();
    });

    test("consume returns the token once for the matching purpose", async () => {
        const s = store();
        const { token } = await s.create({ purpose: "password_reset", sub: "local:u1", expiresAt: future() });

        const consumed = await s.consume("password_reset", token);
        expect(consumed?.sub).toBe("local:u1");
        expect(consumed?.consumedAt).toBeInstanceOf(Date);
        expect(await s.consume("password_reset", token)).toBeNull();
    });

    test("wrong purpose does not consume the token", async () => {
        const s = store();
        const { token } = await s.create({ purpose: "email_verification", sub: "local:u1", expiresAt: future() });

        expect(await s.consume("password_reset", token)).toBeNull();
        expect(await s.consume("email_verification", token)).not.toBeNull();
    });

    test("expired or unknown tokens do not consume", async () => {
        const s = store();
        const { token } = await s.create({ purpose: "password_reset", sub: "local:u1", expiresAt: past() });

        expect(await s.consume("password_reset", token)).toBeNull();
        expect(await s.consume("password_reset", "auth_unknown")).toBeNull();
    });

    test("deleteForSub removes all or only one purpose", async () => {
        const s = store();
        const a = await s.create({ purpose: "password_reset", sub: "local:u1", expiresAt: future() });
        const b = await s.create({ purpose: "email_verification", sub: "local:u1", expiresAt: future() });
        const c = await s.create({ purpose: "password_reset", sub: "local:u2", expiresAt: future() });

        expect(await s.deleteForSub("local:u1", "password_reset")).toBe(1);
        expect(await s.consume("password_reset", a.token)).toBeNull();
        expect(await s.consume("email_verification", b.token)).not.toBeNull();
        expect(await s.deleteForSub("local:u2")).toBe(1);
        expect(await s.consume("password_reset", c.token)).toBeNull();
    });
});
