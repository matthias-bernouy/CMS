import { describe, expect, test } from "bun:test";
import {
    executeAuthSystemSourceEndpoint,
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    type PublicAuthRoutesConfig,
    signupLocalUser,
} from "@bernouy/cms-auth";
import { createLegalPolicy } from "./fixtures";

type Role = "user";

describe("signup legal acceptance flow boundaries", () => {
    test("blocks a system-source bypass when required ids are omitted", async () => {
        const legal = createLegalPolicy();
        const cfg = flowConfig(legal.policy);
        await expect(
            executeAuthSystemSourceEndpoint(
                cfg,
                { urn: "urn:system-auth:signup", targetUrl: "cms-system://auth/signup" },
                jsonRequest({ email: "bypass@x.com", password: "password-1" }),
            ),
        ).rejects.toThrow("all current signup legal documents");
        expect(await cfg.credentials.getByEmail("bypass@x.com")).toBeNull();
    });

    test("normalizes a scalar accepted version through the system source", async () => {
        const legal = createLegalPolicy();
        const cfg = flowConfig(legal.policy);
        const versionId = (await legal.policy.requirements()).documents[0]!.versionId;

        const response = await executeAuthSystemSourceEndpoint(
            cfg,
            { urn: "urn:system-auth:signup", targetUrl: "cms-system://auth/signup" },
            jsonRequest({
                email: "system-scalar@x.com",
                password: "password-1",
                acceptedLegalDocumentVersionIds: versionId,
            }),
        );

        expect(response.status).toBe(200);
        const users = (await cfg.users.list()).users;
        expect(users).toHaveLength(1);
        expect(await legal.store.listForUser(users[0]!.sub)).toHaveLength(1);
    });

    test("does not backfill or require new acceptance when an existing unverified signup is retried", async () => {
        const cfg = flowConfig(undefined);
        const first = await signupLocalUser(cfg, {
            email: "existing@x.com",
            password: "password-1",
        });
        expect(first.created).toBe(true);

        const legal = createLegalPolicy();
        legal.state.page = null;
        cfg.signupLegalAcceptance = legal.policy;
        const retried = await signupLocalUser(cfg, {
            email: "existing@x.com",
            password: "password-1",
        });

        expect(retried.created).toBe(false);
        const users = (await cfg.users.list()).users;
        expect(users).toHaveLength(1);
        expect(await legal.store.listForUser(users[0]!.sub)).toEqual([]);
    });

    test("rolls back both credential and CMS membership when proof storage fails", async () => {
        const legal = createLegalPolicy();
        legal.store.append = async () => {
            throw new Error("proof store unavailable");
        };
        const cfg = flowConfig(legal.policy);
        const versionId = (await legal.policy.requirements()).documents[0]!.versionId;

        await expect(
            signupLocalUser(cfg, {
                email: "rollback@x.com",
                password: "password-1",
                acceptedLegalDocumentVersionIds: [versionId],
            }),
        ).rejects.toThrow("proof store unavailable");
        expect(await cfg.credentials.getByEmail("rollback@x.com")).toBeNull();
        expect((await cfg.users.list()).users).toEqual([]);
    });
});

function flowConfig(signupLegalAcceptance: PublicAuthRoutesConfig<Role>["signupLegalAcceptance"]) {
    return {
        local: {} as PublicAuthRoutesConfig<Role>["local"],
        credentials: new InMemoryLocalCredentialStore(),
        users: new InMemoryUsersRepository<Role>(),
        tokens: new InMemoryAuthTokenStore(),
        emailer: new InMemoryEmailer(),
        defaultRole: "user" as const,
        emailVerificationUrl: "https://example.test/verify",
        passwordResetUrl: "https://example.test/reset",
        signupLegalAcceptance,
    } satisfies PublicAuthRoutesConfig<Role>;
}

function jsonRequest(body: unknown): Request {
    return new Request("https://example.test/.cms/sources/system-auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
