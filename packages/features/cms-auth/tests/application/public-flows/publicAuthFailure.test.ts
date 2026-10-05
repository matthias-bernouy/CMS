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

describe("public auth mutation failure boundaries", () => {
    test("allows email verification to retry after the credential write fails", async () => {
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

    test("allows password reset to retry after the password write fails", async () => {
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

    test("a finalize failure can resume only the exact password mutation", async () => {
        const credentials = new InMemoryLocalCredentialStore();
        const tokens = new InMemoryAuthTokenStore();
        const identity = await credentials.create({
            email: "finalize@example.com",
            password: "old-password",
        });
        const { token } = await tokens.create({
            purpose: "password_reset",
            sub: identity.sub,
            expiresAt: futureDate(),
        });
        const finalize = tokens.finalize.bind(tokens);
        let failFinalize = true;
        tokens.finalize = async (reservationId) => {
            if (failFinalize) {
                return null;
            }
            return finalize(reservationId);
        };
        const cfg = await flowConfig(credentials, tokens, identity);

        await expect(confirmPasswordReset(cfg, { token, password: "new-password" })).rejects.toThrow(
            "reservation expired",
        );
        expect(await credentials.verify("finalize@example.com", "new-password")).toMatchObject({ sub: identity.sub });
        await expect(confirmPasswordReset(cfg, { token, password: "different-password" })).rejects.toThrow(
            "invalid or expired",
        );

        failFinalize = false;
        await expect(confirmPasswordReset(cfg, { token, password: "new-password" })).resolves.toBeUndefined();
        expect(await tokens.consume("password_reset", token)).toBeNull();
    });
});

async function flowConfig(
    credentials: InMemoryLocalCredentialStore,
    tokens: InMemoryAuthTokenStore,
    identity: { sub: string; email?: string },
): Promise<PublicAuthFlowConfig> {
    const users = new InMemoryUsersRepository();
    await users.upsert({
        ...identity,
        sub: `local:${identity.sub}`,
        provider: "local",
    });
    return {
        credentials,
        tokens,
        users,
        emailer: new InMemoryEmailer(),
        emailVerificationUrl: "https://example.test/verify-email",
        passwordResetUrl: "https://example.test/reset-password",
    };
}

function futureDate(): Date {
    return new Date(Date.now() + 60_000);
}
