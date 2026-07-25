import { describe, expect, test } from "bun:test";
import {
    confirmEmailVerification,
    confirmPasswordReset,
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    type PublicAuthFlowConfig,
} from "@bernouy/cms-auth";

type Role = "user";

describe("public auth mutation failure boundaries", () => {
    test.failing("allows email verification to retry after the credential write fails", async () => {
        const credentials = new InMemoryLocalCredentialStore();
        const tokens = new InMemoryAuthTokenStore();
        const identity = await credentials.create({
            email: "verify@example.com",
            password: "old-password",
            emailVerified: false,
        });
        const { token } = await tokens.create({
            purpose: "email_verification",
            sub: identity.sub,
            expiresAt: futureDate(),
        });
        const markEmailVerified = credentials.markEmailVerified.bind(credentials);
        let failWrite = true;
        credentials.markEmailVerified = async (sub) => {
            if (failWrite) {
                throw new Error("credential write unavailable");
            }
            return markEmailVerified(sub);
        };
        const cfg = await flowConfig(credentials, tokens, identity);

        await expect(confirmEmailVerification(cfg, { token })).rejects.toThrow("credential write unavailable");
        failWrite = false;

        await expect(confirmEmailVerification(cfg, { token })).resolves.toBeUndefined();
        expect((await credentials.getByEmail("verify@example.com"))?.emailVerifiedAt).toBeInstanceOf(Date);
    });

    test.failing("allows password reset to retry after the password write fails", async () => {
        const credentials = new InMemoryLocalCredentialStore();
        const tokens = new InMemoryAuthTokenStore();
        const identity = await credentials.create({
            email: "reset@example.com",
            password: "old-password",
        });
        const { token } = await tokens.create({
            purpose: "password_reset",
            sub: identity.sub,
            expiresAt: futureDate(),
        });
        const setPassword = credentials.setPassword.bind(credentials);
        let failWrite = true;
        credentials.setPassword = async (sub, password) => {
            if (failWrite) {
                throw new Error("credential write unavailable");
            }
            return setPassword(sub, password);
        };
        const cfg = await flowConfig(credentials, tokens, identity);

        await expect(
            confirmPasswordReset(cfg, {
                token,
                password: "new-password",
            }),
        ).rejects.toThrow("credential write unavailable");
        failWrite = false;

        await expect(
            confirmPasswordReset(cfg, {
                token,
                password: "new-password",
            }),
        ).resolves.toBeUndefined();
        expect(await credentials.verify("reset@example.com", "old-password")).toBeNull();
        expect(await credentials.verify("reset@example.com", "new-password")).toMatchObject({
            sub: identity.sub,
        });
    });
});

async function flowConfig(
    credentials: InMemoryLocalCredentialStore,
    tokens: InMemoryAuthTokenStore,
    identity: { sub: string; email?: string },
): Promise<PublicAuthFlowConfig<Role>> {
    const users = new InMemoryUsersRepository<Role>();
    await users.upsert(
        {
            ...identity,
            sub: `local:${identity.sub}`,
            provider: "local",
        },
        "user",
    );
    return {
        credentials,
        tokens,
        users,
        emailer: new InMemoryEmailer(),
        defaultRole: "user",
        emailVerificationUrl: "https://example.test/verify-email",
        passwordResetUrl: "https://example.test/reset-password",
    };
}

function futureDate(): Date {
    return new Date(Date.now() + 60_000);
}
