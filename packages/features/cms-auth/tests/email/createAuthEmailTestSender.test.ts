import { expect, test } from "bun:test";
import { InMemoryEmailer } from "@bernouy/cms-auth";
import { createAuthEmailTestSender } from "@bernouy/cms-auth/management";

test("admin test emails preserve relative URLs and compose without account or token stores", async () => {
    const emailer = new InMemoryEmailer();
    const sender = createAuthEmailTestSender({
        emailer,
        emailVerificationUrl: "/verify?lang=en",
        passwordResetUrl: "https://site.test/reset?token=old#form",
        siteName: "Test site",
        emailComposer: {
            async compose(input) {
                expect(input.siteName).toBe("Test site");
                expect(input.token).toBe("test-token");
                expect(input.expiresAt.getTime()).toBeGreaterThan(Date.now());
                return { to: input.to, subject: input.kind, text: input.actionUrl };
            },
        },
    });
    expect(Object.keys(sender)).toEqual(["send"]);
    await sender.send({ kind: "email_verification", to: "member@example.test" });
    await sender.send({ kind: "password_reset", to: "member@example.test" });
    expect(emailer.sent.map((email) => email.text)).toEqual([
        "/verify?lang=en&token=test-token",
        "https://site.test/reset?token=test-token#form",
    ]);
});
