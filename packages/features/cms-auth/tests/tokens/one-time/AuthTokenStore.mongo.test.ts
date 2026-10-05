import { describe, expect, test } from "bun:test";
import { MongoAuthTokenStore } from "cms-auth/tokens/one-time/default-implementation/mongo/MongoAuthTokenStore";
import { FakeAuthTokenDb } from "./authTokenMongoFixture";

const future = () => new Date(Date.now() + 60_000);

describe("MongoAuthTokenStore", () => {
    test("creates the required indexes without exposing token hashes", async () => {
        const fixture = new FakeAuthTokenDb();
        const store = new MongoAuthTokenStore(fixture.asDb());
        await store.init();
        const created = await store.create({ purpose: "password_reset", sub: "local:u1", expiresAt: future() });

        expect(fixture.collection.indexes).toHaveLength(4);
        expect(created.token.startsWith("auth_")).toBeTrue();
        expect((created.authToken as Record<string, unknown>).hash).toBeUndefined();
    });

    test("atomically excludes concurrent reservations and binds every retry to one operation", async () => {
        const store = new MongoAuthTokenStore(new FakeAuthTokenDb().asDb());
        const { token } = await store.create({ purpose: "password_reset", sub: "local:u1", expiresAt: future() });

        const reservations = await Promise.all([
            store.reserve("password_reset", token, "set-password:first"),
            store.reserve("password_reset", token, "set-password:first"),
        ]);
        const winner = reservations.find((reservation) => reservation !== null);
        expect(reservations.filter(Boolean)).toHaveLength(1);
        expect(await store.release(winner!.id)).toBeTrue();
        expect(await store.reserve("password_reset", token, "set-password:second")).toBeNull();

        const retry = await store.reserve("password_reset", token, "set-password:first");
        expect(await store.finalize(retry!.id)).toMatchObject({ sub: "local:u1", consumedAt: expect.any(Date) });
        expect(await store.reserve("password_reset", token, "set-password:first")).toBeNull();
    });

    test("rejects wrong purposes and deletes only the selected subject tokens", async () => {
        const store = new MongoAuthTokenStore(new FakeAuthTokenDb().asDb());
        const password = await store.create({ purpose: "password_reset", sub: "local:u1", expiresAt: future() });
        const verification = await store.create({
            purpose: "email_verification",
            sub: "local:u1",
            expiresAt: future(),
        });

        expect(await store.consume("email_verification", password.token)).toBeNull();
        expect(await store.deleteForSub("local:u1", "password_reset")).toBe(1);
        expect(await store.consume("password_reset", password.token)).toBeNull();
        expect(await store.consume("email_verification", verification.token)).not.toBeNull();
    });
});
