import { expect, test } from "bun:test";
import { EmailDeliveryDisabledError, isEmailDeliveryDisabledError } from "@bernouy/email";
import {
    createPublicAuthActions,
    InMemoryAuthTokenStore,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
} from "@bernouy/auth";
import { httpFixture } from "./http.fixture";
import { selectedAccountEmailer } from "../../../src/runtime/authentication/templates/delivery";

const message = { to: { email: "visitor@example.test" }, subject: "Subject", text: "Body" };
test("signed remote EMAIL_DISABLED preserves account policy even after an enabled check; other failures stay failures", async () => {
    let disabled = false;
    const unused = async (): Promise<never> => {
        throw new Error("No SMTP administration expected");
    };
    const f = await httpFixture({
        isEnabled: async () => true,
        send: async () => {
            throw disabled ? new EmailDeliveryDisabledError("Private backend diagnostic") : new Error("Backend down");
        },
        getConfiguration: unused,
        updateConfiguration: unused,
    });
    try {
        const emailer = selectedAccountEmailer(f.call, async () => true);
        expect(await emailer.isEnabled()).toBe(true);
        disabled = true;
        await expect(emailer.send(message)).rejects.toBeInstanceOf(EmailDeliveryDisabledError);
        const tokens = new InMemoryAuthTokenStore();
        const credentials = new InMemoryLocalCredentialStore();
        const actions = createPublicAuthActions({
            credentials,
            tokens,
            users: new InMemoryUsersRepository(),
            emailer,
            emailComposer: { compose: async ({ to }) => ({ to, subject: message.subject, text: message.text }) },
            revokeSessionsForSub: async () => {},
            emailVerificationUrl: "https://site.test/verify",
            passwordResetUrl: "https://site.test/reset",
        });
        await actions.signup({ email: message.to.email, password: "strong-enough-test-password" });
        const credential = await credentials.getByEmail(message.to.email);
        expect(credential?.emailVerifiedAt).toBeInstanceOf(Date);
        expect(await tokens.findActive("email_verification", credential!.sub)).toBeNull();
        await actions.requestPasswordReset({ email: message.to.email });
        expect(await tokens.findActive("password_reset", credential!.sub)).toBeNull();
        disabled = false;
        await emailer.send(message).then(
            () => {
                throw new Error("Unexpected delivery");
            },
            (error: unknown) => {
                expect(isEmailDeliveryDisabledError(error)).toBe(false);
                expect(String(error)).not.toContain("Backend down");
            },
        );
        const beforeRevocation = f.calls();
        f.revoke();
        await expect(emailer.send(message)).rejects.toThrow();
        expect(f.calls()).toBe(beforeRevocation);
    } finally {
        f.close();
    }
});
