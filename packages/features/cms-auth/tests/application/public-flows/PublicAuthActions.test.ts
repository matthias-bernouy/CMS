import { expect, test } from "bun:test";
import {
    createPublicAuthActions,
    InMemoryAuthTokenStore,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
} from "@bernouy/cms-auth";
import { InMemoryEmailer } from "@bernouy/cms-emailer";

test("public auth exposes only account lifecycle operations used by Access", () => {
    const config = {
        credentials: new InMemoryLocalCredentialStore(),
        users: new InMemoryUsersRepository(),
        tokens: new InMemoryAuthTokenStore(),
        emailer: new InMemoryEmailer(),
        emailVerificationUrl: "https://example.test/verify",
        passwordResetUrl: "https://example.test/reset",
    };

    const actions = createPublicAuthActions(config);

    expect(actions).not.toBe(config);
    expect(Object.keys(actions).sort()).toEqual([
        "confirmEmailVerification",
        "confirmPasswordReset",
        "requestEmailVerification",
        "requestPasswordReset",
        "signup",
    ]);
    for (const name of ["credentials", "users", "tokens", "emailer", "config"]) {
        expect(actions).not.toHaveProperty(name);
    }
});
