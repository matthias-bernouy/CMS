import { describe, expect, test } from "bun:test";
import {
    InMemoryAuthTokenStore,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    signupLocalUser,
    type PublicAuthFlowConfig,
} from "@bernouy/cms-auth";
import { InMemoryEmailer } from "@bernouy/cms-emailer";
import { prepareSignupLocalUser } from "cms-auth/application/core/public-flows/flows";

describe("signup activation", () => {
    test("keeps a new credential pending until the prepared signup is finalized", async () => {
        const cfg = flowConfig();
        const prepared = await prepareSignupLocalUser(cfg, input("prepared@x.com", "password-1"));
        const credential = await cfg.credentials.getByEmail("prepared@x.com");

        expect(credential).not.toBeNull();
        expect(prepared.cmsUserId).toBe(`local:${credential!.sub}`);
        expect((await cfg.users.list()).users).toEqual([]);
        expect((cfg.emailer as InMemoryEmailer).sent).toEqual([]);

        const first = await prepared.finalize();
        const second = await prepared.finalize();

        expect(second).toEqual(first);
        expect((await cfg.users.list()).users).toHaveLength(1);
        expect((cfg.emailer as InMemoryEmailer).sent).toHaveLength(1);
    });

    test("resumes a credential after membership activation failed", async () => {
        const cfg = flowConfig();
        const upsert = cfg.users.upsert.bind(cfg.users);
        let failOnce = true;
        cfg.users.upsert = async (identity) => {
            if (failOnce) {
                failOnce = false;
                throw new Error("membership unavailable");
            }
            return upsert(identity);
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

    test("a pending signup resumes through the required password verifier without using login verification", async () => {
        const cfg = flowConfig();
        const credentials = cfg.credentials;
        const identity = await credentials.create({
            email: "pending-custom@x.com",
            password: "password-1",
            emailVerified: false,
        });
        let passwordChecks = 0;
        cfg.credentials = {
            create: credentials.create.bind(credentials),
            verify: async () => {
                throw new Error("Login verification cannot resume an unverified signup");
            },
            verifyPassword: async (email, password) => {
                passwordChecks++;
                return credentials.verifyPassword(email, password);
            },
            setPassword: credentials.setPassword.bind(credentials),
            markEmailVerified: credentials.markEmailVerified.bind(credentials),
            getByEmail: credentials.getByEmail.bind(credentials),
            delete: credentials.delete.bind(credentials),
            list: credentials.list.bind(credentials),
        };
        await expect(signupLocalUser(cfg, input("pending-custom@x.com", "wrong-password"))).resolves.toMatchObject({
            cmsUserId: null,
        });
        expect((await cfg.users.list()).users).toHaveLength(0);
        await expect(signupLocalUser(cfg, input("pending-custom@x.com", "password-1"))).resolves.toMatchObject({
            created: false,
            cmsUserId: `local:${identity.sub}`,
        });
        expect(passwordChecks).toBe(2);
        expect((await cfg.users.list()).users).toHaveLength(1);
    });
});

function flowConfig(): PublicAuthFlowConfig {
    return {
        credentials: new InMemoryLocalCredentialStore(),
        users: new InMemoryUsersRepository(),
        tokens: new InMemoryAuthTokenStore(),
        emailer: new InMemoryEmailer(),
        emailVerificationUrl: "https://example.test/verify",
        passwordResetUrl: "https://example.test/reset",
    };
}

function input(email: string, password: string) {
    return { email, password };
}
