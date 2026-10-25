import { expect, test } from "bun:test";
import { InMemoryOAuthStore, McpAuthorization } from "@bernouy/cms-auth/oauth";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { oauthFixture } from "./fixture";

test("named loopback instances are allowed while deceptive remote HTTP origins stay forbidden", () => {
    for (const hostname of ["localhost", "preview.localhost", "nested.preview.localhost", "127.0.0.1", "[::1]"]) {
        expect(
            () =>
                new McpAuthorization(
                    new InMemoryOAuthStore(),
                    { canConnect: async () => true },
                    `http://${hostname}/.cms/mcp`,
                    new Uint8Array(32),
                ),
        ).not.toThrow();
    }
    for (const hostname of ["evil-localhost", "localhost.evil", "preview.localhost.evil", "-bad.localhost"]) {
        expect(
            () =>
                new McpAuthorization(
                    new InMemoryOAuthStore(),
                    { canConnect: async () => true },
                    `http://${hostname}/.cms/mcp`,
                    new Uint8Array(32),
                ),
        ).toThrow();
    }
});
test("anonymous registrations cannot exhaust a year-long pool and their short lifetime is promoted only after approval", async () => {
    const f = await oauthFixture();
    for (let i = 0; i < 1024; i++) {
        await f.store.create({
            id: `client:old-${i}`,
            revision: 0,
            value: {},
            expiresAt: Date.now() + 365 * 86400_000,
        });
    }
    const client = await f.authorization.register({ redirect_uris: ["https://legitimate.example/callback"] });
    expect((await f.store.get(`client:${client.client_id}`))!.expiresAt - Date.now()).toBeLessThanOrEqual(600_000);
    f.advance(590_000);
    const pending = await f.prepare();
    f.advance(20_000);
    const accepted = await f.authorization.authorize(pending.requestId, "admin");
    expect((await f.store.get(`client:${f.client.client_id}`))!.expiresAt - Date.now()).toBeGreaterThan(
        300 * 86400_000,
    );
    expect((await f.exchange(new URL(accepted.redirectUri).searchParams.get("code")!)).access_token).toBeString();
});
test("public registration and consent preparation use independent bounded rate budgets", async () => {
    const f = await oauthFixture();
    let registered = 0;
    for (let i = 0; i < 40; i++) {
        try {
            await f.authorization.register({ redirect_uris: ["https://client.example/callback"] });
            registered++;
        } catch (error) {
            expect((error as any).status).toBe(429);
        }
    }
    expect(registered).toBe(31);
    expect((await f.prepare()).requestId).toBeString();
    const limiter = new InMemoryRateLimiter({ limit: 32, windowSeconds: 60 });
    const fresh = new McpAuthorization(
        f.store,
        { canConnect: async () => true },
        f.resource,
        new Uint8Array(32),
        Date.now,
        limiter,
    );
    expect((await fresh.register({ redirect_uris: ["https://new.example/callback"] })).client_id).toBeString();
});
