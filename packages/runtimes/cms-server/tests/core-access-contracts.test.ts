import { expect, test } from "bun:test";
import {
    DefaultCoreCapabilityDispatcher,
    InMemoryCmsRepository,
    type CoreCapabilityInvocationContext,
} from "@bernouy/cms-content";
import { registerAccessCapabilities } from "@bernouy/cms-core/capabilities";
import { InMemoryIdentityProviderRepository, InMemoryUsersRepository } from "@bernouy/cms-auth";

const context: CoreCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    siteId: "default",
    installationId: "official",
    origin: "control",
    actorKind: "administrator",
    providerSubjectId: "provider-admin",
};

test("access capabilities protect the caller and cleanly remove another member", async () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    const users = new InMemoryUsersRepository();
    await users.upsert({ sub: "local:admin", provider: "local", email: "admin@example.test" });
    await users.upsert({ sub: "oidc:member", provider: "oidc", email: "member@example.test" });
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
        identityProviders: new InMemoryIdentityProviderRepository(),
        credentials: {},
        pats: { list: async () => [], revoke: async () => false },
    };
    const gateway = {
        siteId: "default",
        installations: {
            get: async () => ({ installation: { providerId: "ulvia.official" } }),
        },
        identities: { resolve: async () => "local:admin" },
        administrators,
    };
    registerAccessCapabilities(dispatcher, core as never, gateway as never);

    expect(await dispatcher.invoke("ulvia.cms.access", "overview", {}, context)).toMatchObject({
        users: [
            { sub: "local:admin", administrator: true, administratorRevision: 1 },
            { sub: "oidc:member", administrator: false, administratorRevision: 0 },
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
            { sub: "oidc:member", enabled: true, expectedRevision: 0 },
            context,
        ),
    ).toMatchObject({ sub: "oidc:member", administrator: true, revision: 1 });

    expect(await dispatcher.invoke("ulvia.cms.access", "delete-user", { sub: "oidc:member" }, context)).toEqual({
        sub: "oidc:member",
        deleted: true,
    });
    expect(await users.getBySub("oidc:member")).toBeNull();
    expect((await administrators.get("oidc:member")).enabled).toBe(false);
});
