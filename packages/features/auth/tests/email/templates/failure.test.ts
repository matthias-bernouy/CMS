import { expect, test } from "bun:test";
import { InMemoryAuthTokenStore, InMemoryLocalCredentialStore, InMemoryUsersRepository } from "@bernouy/auth";
import { InMemoryEmailer } from "@bernouy/email";
import { sendPasswordResetForCredential } from "auth/application/core/public-flows/emailDelivery";

test("composition failure consumes only its own token and leaves a concurrent newer token active", async () => {
    const tokens = new InMemoryAuthTokenStore();
    const emailer = new InMemoryEmailer();
    let own = "";
    let newer = "";
    await expect(
        sendPasswordResetForCredential(
            {
                credentials: new InMemoryLocalCredentialStore(),
                users: new InMemoryUsersRepository(),
                tokens,
                emailer,
                revokeSessionsForSub: async () => {},
                emailVerificationUrl: "https://site.test/verify",
                passwordResetUrl: "https://site.test/reset",
                emailComposer: {
                    compose: async (input) => {
                        own = input.token;
                        newer = (
                            await tokens.create({
                                purpose: "password_reset",
                                sub: "user-a",
                                expiresAt: new Date(Date.now() + 60000),
                            })
                        ).token;
                        throw new Error("Templates unavailable");
                    },
                },
            },
            { sub: "user-a", email: "visitor@example.com" },
        ),
    ).rejects.toThrow("Templates unavailable");
    expect(await tokens.consume("password_reset", own)).toBeNull();
    expect(await tokens.consume("password_reset", newer)).not.toBeNull();
});
