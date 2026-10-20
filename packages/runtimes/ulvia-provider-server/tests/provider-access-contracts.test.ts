import { describe, expect, test } from "bun:test";
import {
    DefaultProviderCapabilityDispatcher,
    ProviderCapabilityResponse,
    type ProviderCapabilityInvocationContext,
} from "@bernouy/ulvia-provider";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { registerAccessCapabilities } from "@bernouy/ulvia-provider/capabilities";
import { InMemoryUsersRepository } from "@bernouy/cms-auth";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia.official",
    subjectId: "provider-admin",
};

test("access capabilities protect the caller and cleanly remove another member", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const users = new InMemoryUsersRepository();
    await users.upsert({ sub: "local:admin", provider: "local", email: "admin@example.test" });
    await users.upsert({ sub: "external:member", provider: "external", email: "member@example.test" });
    const grants = new Map([["local:admin", { sub: "local:admin", enabled: true, revision: 1, bootstrap: true }]]);
    const administrators = {
        list: async () => [...grants.values()].filter(({ enabled }) => enabled).map(({ sub }) => sub),
        get: async (sub: string) => grants.get(sub) ?? { sub, enabled: false, revision: 0, bootstrap: false },
        canRevoke: async (sub: string) => sub !== "local:admin",
        set: async (sub: string, enabled: boolean, expectedRevision: number) => {
            const current = grants.get(sub) ?? { sub, enabled: false, revision: 0, bootstrap: false };
            if (current.revision !== expectedRevision) {
                throw Object.assign(new Error("conflict"), { status: 409 });
            }
            const next = { ...current, enabled, revision: current.revision + 1 };
            grants.set(sub, next);
            return next;
        },
    };
    const core = {
        repo: new InMemoryCmsRepository(),
        users,
        credentials: {},
        pats: { list: async () => [], revoke: async () => false },
    };
    const gateway = {
        siteId: "default",
        identities: { resolve: async () => "local:admin" },
        administrators,
    };
    registerAccessCapabilities(dispatcher, core as never, gateway as never);

    expect(await dispatcher.invoke("ulvia.cms.access", "overview", {}, context)).toMatchObject({
        users: [
            { sub: "local:admin", administrator: true, administratorRevision: 1 },
            { sub: "external:member", administrator: false, administratorRevision: 0 },
        ],
    });

    await expect(
        dispatcher.invoke(
            "ulvia.cms.access",
            "set-administrator",
            { sub: "local:admin", enabled: false, expectedRevision: 1 },
            context,
        ),
    ).rejects.toMatchObject({ code: "CANNOT_REMOVE_SELF", status: 409 });

    expect(
        await dispatcher.invoke(
            "ulvia.cms.access",
            "set-administrator",
            { sub: "external:member", enabled: true, expectedRevision: 0 },
            context,
        ),
    ).toMatchObject({ sub: "external:member", administrator: true, revision: 1 });

    expect(await dispatcher.invoke("ulvia.cms.access", "delete-user", { sub: "external:member" }, context)).toEqual({
        sub: "external:member",
        deleted: true,
    });
    expect(await users.getBySub("external:member")).toBeNull();
    expect((await administrators.get("external:member")).enabled).toBe(false);
});

describe("Access authentication capabilities", () => {
    test("resolves opaque credentials and returns semantic session effects", async () => {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        const subject = { identifier: "local:member", email: "member@example.test" };
        const admin = { identifier: "local:admin", email: "admin@example.test" };
        const dependencies = {
            authentication: {
                authenticate: async (email: string | undefined, password: string | undefined) =>
                    email === subject.email && password === "correct-password"
                        ? {
                              ok: true as const,
                              subject,
                              session: { token: "opaque-session", expiresAt: "2030-01-01T00:00:00.000Z" },
                          }
                        : { ok: false as const, error: "invalid_credentials" as const },
                resolveCredential: async (credential: ProviderCapabilityInvocationContext["actorCredential"]) => {
                    if (credential?.token === "valid-user-session") {
                        return subject;
                    }
                    return credential?.token === "valid-admin-session" ? admin : null;
                },
            },
            accountLifecycle: {
                signup: async () => ({ ok: true }),
                requestEmailVerification: async () => ({ sent: true }),
                confirmEmailVerification: async () => ({ verified: true }),
                requestPasswordReset: async () => ({ sent: true }),
                confirmPasswordReset: async () => ({ reset: true }),
            },
        };
        const gateway = {
            administrators: {
                get: async (sub: string) => ({
                    sub,
                    enabled: sub === admin.identifier,
                    revision: sub === admin.identifier ? 7 : 2,
                    bootstrap: false,
                }),
            },
        };
        registerAccessCapabilities(dispatcher, dependencies as never, gateway as never);

        expect(await dispatcher.invoke("ulvia.cms.access", "resolve-actor", {}, context)).toEqual({
            state: "anonymous",
        });
        expect(
            await dispatcher.invoke(
                "ulvia.cms.access",
                "resolve-actor",
                {},
                {
                    ...context,
                    actorCredential: { kind: "session", token: "valid-user-session" },
                },
            ),
        ).toEqual({
            state: "authenticated",
            subjectId: "local:member",
            administrator: false,
            authorizationRevision: 2,
        });
        expect(
            await dispatcher.invoke(
                "ulvia.cms.access",
                "resolve-actor",
                {},
                {
                    ...context,
                    actorCredential: { kind: "session", token: "valid-admin-session" },
                },
            ),
        ).toEqual({
            state: "authenticated",
            subjectId: "local:admin",
            administrator: true,
            authorizationRevision: 7,
        });

        const login = (await dispatcher.invoke(
            "ulvia.cms.access",
            "login-password",
            { email: subject.email, password: "correct-password" },
            context,
        )) as ProviderCapabilityResponse;
        expect(login.output).toEqual({ subjectId: "local:member", administrator: false });
        expect(login.responseEffect).toEqual({
            type: "session",
            operation: "establish",
            token: "opaque-session",
            expiresAt: "2030-01-01T00:00:00.000Z",
        });

        const logout = (await dispatcher.invoke(
            "ulvia.cms.access",
            "logout",
            {},
            context,
        )) as ProviderCapabilityResponse;
        expect(logout.responseEffect).toEqual({ type: "session", operation: "clear" });
        await expect(
            dispatcher.invoke(
                "ulvia.cms.access",
                "login-password",
                { email: subject.email, password: "wrong-password" },
                context,
            ),
        ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    });
});
