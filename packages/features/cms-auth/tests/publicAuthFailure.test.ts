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
            if (failWrite) throw new Error("credential write unavailable");
            return markEmailVerified(sub);
        };

        await expect(confirmEmailVerification(flowConfig(credentials, tokens), { token }))
            .rejects.toThrow("credential write unavailable");
        failWrite = false;

        await expect(confirmEmailVerification(flowConfig(credentials, tokens), { token }))
            .resolves.toBeUndefined();
        expect((await credentials.getByEmail("verify@example.com"))?.emailVerifiedAt)
            .toBeInstanceOf(Date);
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
            if (failWrite) throw new Error("credential write unavailable");
            return setPassword(sub, password);
        };

        await expect(confirmPasswordReset(flowConfig(credentials, tokens), {
            token,
            password: "new-password",
        })).rejects.toThrow("credential write unavailable");
        failWrite = false;

        await expect(confirmPasswordReset(flowConfig(credentials, tokens), {
            token,
            password: "new-password",
        })).resolves.toBeUndefined();
        expect(await credentials.verify("reset@example.com", "old-password")).toBeNull();
        expect(await credentials.verify("reset@example.com", "new-password")).toMatchObject({
            sub: identity.sub,
        });
    });
});

function flowConfig(
    credentials: InMemoryLocalCredentialStore,
    tokens: InMemoryAuthTokenStore,
): PublicAuthFlowConfig<Role> {
    return {
        credentials,
        tokens,
        users: new InMemoryUsersRepository<Role>(),
        emailer: new InMemoryEmailer(),
        defaultRole: "user",
        emailVerificationUrl: "https://example.test/verify-email",
        passwordResetUrl: "https://example.test/reset-password",
    };
}

function futureDate(): Date {
    return new Date(Date.now() + 60_000);
}
