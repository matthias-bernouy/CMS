import { describe, expect, test } from "bun:test";
import { SignedCookieCodec } from "@bernouy/cms-auth";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { SubjectResolver } from "cms-auth/accounts/core/SubjectResolver";
import { InMemoryUsersRepository } from "cms-auth/accounts/default-implementation/memory/InMemoryUsersRepository";
import { LocalAuthentication } from "cms-auth/application/core/authentication/LocalAuthentication";
import { InMemoryLocalCredentialStore } from "cms-auth/providers/default-implementation/memory/InMemoryLocalCredentialStore";
import { InMemoryPatRepository } from "cms-auth/tokens/personal-access/default-implementation/memory/InMemoryPatRepository";

function setup(rateLimit?: InMemoryRateLimiter) {
    const users = new InMemoryUsersRepository();
    const credentials = new InMemoryLocalCredentialStore();
    const pats = new InMemoryPatRepository();
    const codec = new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes"));
    const auth = new LocalAuthentication({
        providerId: "local",
        credentials,
        resolver: new SubjectResolver(users),
        codec,
        pats,
        ...(rateLimit ? { rateLimit } : {}),
    });
    return { auth, codec, credentials, pats };
}

describe("LocalAuthentication", () => {
    test("valid credentials issue a provider-neutral session token", async () => {
        const { auth, credentials } = setup();
        await credentials.create({ email: "a@x.com", password: "password-1" });

        const result = await auth.authenticate("a@x.com", "password-1");

        expect(result.ok).toBeTrue();
        if (result.ok) {
            expect(result.subject.identifier).toStartWith("local:");
            expect(result.session.token.length).toBeGreaterThan(20);
            expect(new Date(result.session.expiresAt).getTime()).toBeGreaterThan(Date.now());
            expect(await auth.resolveCredential({ kind: "session", token: result.session.token })).toEqual(
                result.subject,
            );
        }
    });

    test("unverified or invalid credentials cannot create a session", async () => {
        const { auth, credentials } = setup();
        await credentials.create({ email: "a@x.com", password: "password-1", emailVerified: false });

        expect(await auth.authenticate("a@x.com", "password-1")).toEqual({
            ok: false,
            error: "invalid_credentials",
        });
        expect(await auth.authenticate("a@x.com", "wrong-password")).toEqual({
            ok: false,
            error: "invalid_credentials",
        });
    });

    test("throttles password proof and resets the counter after success", async () => {
        const limiter = new InMemoryRateLimiter({ limit: 2, windowSeconds: 60 });
        const { auth, credentials } = setup(limiter);
        await credentials.create({ email: "a@x.com", password: "password-1" });

        expect(await auth.authenticate("a@x.com", "wrong-password")).toMatchObject({ error: "invalid_credentials" });
        expect(await auth.authenticate("a@x.com", "password-1")).toMatchObject({ ok: true });
        expect(await auth.authenticate("a@x.com", "wrong-password")).toMatchObject({ error: "invalid_credentials" });
        expect(await auth.authenticate("a@x.com", "wrong-password")).toMatchObject({ error: "invalid_credentials" });
        expect(await auth.authenticate("a@x.com", "wrong-password")).toEqual({
            ok: false,
            error: "rate_limited",
        });
    });

    test("resolves PATs and fails closed for invalid credentials", async () => {
        const { auth, codec, credentials, pats } = setup();
        await credentials.create({ email: "a@x.com", password: "password-1" });
        const login = await auth.authenticate("a@x.com", "password-1");
        expect(login.ok).toBeTrue();
        if (!login.ok) {
            return;
        }
        const { token, pat } = await pats.create({ sub: login.subject.identifier, name: "cli" });

        expect(await auth.resolveCredential({ kind: "bearer", token })).toEqual(login.subject);
        expect(await pats.revoke(login.subject.identifier, pat.id)).toBeTrue();
        expect(await auth.resolveCredential({ kind: "bearer", token })).toBeNull();
        const expiredSession = await codec.sign({ kind: "session", sub: login.subject.identifier }, -1);
        expect(await auth.resolveCredential({ kind: "session", token: expiredSession })).toBeNull();
        expect(await auth.resolveCredential({ kind: "bearer", token: "pat_invalid" })).toBeNull();
        expect(await auth.resolveCredential(undefined)).toBeNull();
    });

    test("rejects session TTLs that the Kernel cookie policy cannot honor", () => {
        const create = (sessionTtlSeconds: number) => {
            const users = new InMemoryUsersRepository();
            return new LocalAuthentication({
                providerId: "local",
                credentials: new InMemoryLocalCredentialStore(),
                resolver: new SubjectResolver(users),
                codec: new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes")),
                sessionTtlSeconds,
            });
        };

        expect(() => create(0)).toThrow("between 1 second and 31 days");
        expect(() => create(31 * 24 * 60 * 60 + 1)).toThrow("between 1 second and 31 days");
    });
});
