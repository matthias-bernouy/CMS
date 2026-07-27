import { describe, expect, test } from "bun:test";
import {
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    signupLocalUser,
    type PublicAuthFlowConfig,
} from "@bernouy/cms-auth";

type Role = "user";

describe("signup activation", () => {
    test("resumes a credential after membership activation failed", async () => {
        const cfg = flowConfig();
        const upsert = cfg.users.upsert.bind(cfg.users);
        let failOnce = true;
        cfg.users.upsert = async (identity, role) => {
            if (failOnce) {
                failOnce = false;
                throw new Error("membership unavailable");
            }
            return upsert(identity, role);
        };

        await expect(signupLocalUser(cfg, input("pending@x.com", "password-1"))).rejects.toThrow(
            "membership unavailable",
        );
        const credential = await cfg.credentials.getByEmail("pending@x.com");
        expect(credential?.emailVerifiedAt).toBeNull();
        expect((await cfg.users.list()).users).toEqual([]);

        const resumed = await signupLocalUser(cfg, input("pending@x.com", "password-1"));
        expect(resumed).toMatchObject({
            created: false,
            cmsUserId: `local:${credential!.sub}`,
        });
        expect((await cfg.users.list()).users).toHaveLength(1);
    });

    test("does not resume a pending credential with a wrong password", async () => {
        const cfg = flowConfig();
        const upsert = cfg.users.upsert.bind(cfg.users);
        cfg.users.upsert = async () => {
            throw new Error("membership unavailable");
        };

        await expect(signupLocalUser(cfg, input("wrong@x.com", "password-1"))).rejects.toThrow(
            "membership unavailable",
        );
        cfg.users.upsert = upsert;

        await expect(signupLocalUser(cfg, input("wrong@x.com", "wrong-password"))).resolves.toEqual({
            created: false,
            sent: false,
            cmsUserId: null,
        });
        expect((await cfg.users.list()).users).toEqual([]);
    });

    test("keeps an active duplicate opaque while exposing a verified subject to server callers", async () => {
        const cfg = flowConfig();
        const created = await signupLocalUser(cfg, input("active@x.com", "password-1"));
        expect(created.cmsUserId).toMatch(/^local:/);

        const wrong = await signupLocalUser(cfg, input("active@x.com", "wrong-password"));
        expect(wrong).toEqual({ created: false, sent: false, cmsUserId: null });

        const retry = await signupLocalUser(cfg, input("active@x.com", "password-1"));
        expect(retry).toMatchObject({ created: false, cmsUserId: created.cmsUserId });
    });

    test("keeps legacy credential stores compatible and fails closed for pending credentials", async () => {
        const cfg = flowConfig();
        const credentials = cfg.credentials;
        await credentials.create({
            email: "legacy-store@x.com",
            password: "password-1",
            emailVerified: false,
        });
        let fallbackVerifyCalls = 0;
        cfg.credentials = {
            create: credentials.create.bind(credentials),
            verify: async (email, password) => {
                fallbackVerifyCalls++;
                return credentials.verify(email, password);
            },
            setPassword: credentials.setPassword.bind(credentials),
            markEmailVerified: credentials.markEmailVerified.bind(credentials),
            getByEmail: credentials.getByEmail.bind(credentials),
            delete: credentials.delete.bind(credentials),
            list: credentials.list.bind(credentials),
        };

        await expect(signupLocalUser(cfg, input("legacy-store@x.com", "password-1"))).resolves.toEqual({
            created: false,
            sent: false,
            cmsUserId: null,
        });
        expect(fallbackVerifyCalls).toBe(1);
        expect((await cfg.users.list()).users).toEqual([]);
    });
});

function flowConfig(): PublicAuthFlowConfig<Role> {
    return {
        credentials: new InMemoryLocalCredentialStore(),
        users: new InMemoryUsersRepository<Role>(),
        tokens: new InMemoryAuthTokenStore(),
        emailer: new InMemoryEmailer(),
        defaultRole: "user",
        emailVerificationUrl: "https://example.test/verify",
        passwordResetUrl: "https://example.test/reset",
    };
}

function input(email: string, password: string) {
    return { email, password };
}
