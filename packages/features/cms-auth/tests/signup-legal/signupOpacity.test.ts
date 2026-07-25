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

describe("signup activation opacity", () => {
    test("spends one password-verification work unit before handling an active email", async () => {
        const cfg = flowConfig();
        await signupLocalUser(cfg, input("active@x.com", "password-1"));
        const verifyPassword = cfg.credentials.verifyPassword!.bind(cfg.credentials);
        let calls = 0;
        cfg.credentials.verifyPassword = async (email, password) => {
            calls++;
            return verifyPassword(email, password);
        };

        await signupLocalUser(cfg, input("active@x.com", "wrong-password"));

        expect(calls).toBe(1);
    });

    test("keeps legacy stores compatible and fails closed when a pending signup cannot be verified", async () => {
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
