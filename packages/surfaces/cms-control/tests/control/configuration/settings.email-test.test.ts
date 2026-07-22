import { describe, expect, test } from "bun:test";
import { InMemoryEmailer } from "@bernouy/cms-auth";
import type { ControlCms } from "cms-control/ControlCms";
import postEmailTest from "cms-control/api/system/email-test.post";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

const req = (body: Record<string, unknown>) =>
    new Request("http://control/api/system/email-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

describe("POST /api/system/email-test", () => {
    test("sends a selected auth template through the configured public auth emailer", async () => {
        const emailer = new InMemoryEmailer();
        const cms = {
            publicAuth: {
                emailer,
                emailVerificationUrl: "https://site.test/verify",
                passwordResetUrl: "https://site.test/reset",
                siteName: "Test Site",
                emailComposer: {
                    compose: async (input: any) => ({
                        to: input.to,
                        subject: `template:${input.kind}`,
                        text: input.actionUrl,
                    }),
                },
            },
        } as unknown as ControlCms;

        const res = await postEmailTest(req({ to: "ada@example.com", kind: "password_reset" }), cms);

        expect(res.status).toBe(200);
        expect(emailer.sent).toHaveLength(1);
        expect(emailer.sent[0]).toMatchObject({
            to: { email: "ada@example.com" },
            subject: "template:password_reset",
        });
        expect(emailer.sent[0]!.text).toBe("https://site.test/reset?token=test-token");
    });

    test("rejects invalid recipient emails", async () => {
        const emailer = new InMemoryEmailer();
        const cms = { publicAuth: { emailer } } as unknown as ControlCms;

        await expect(postEmailTest(req({ to: "invalid", kind: "email_verification" }), cms)).rejects.toThrow(
            InvalidParam,
        );
        expect(emailer.sent).toHaveLength(0);
    });

    test("rejects invalid template kinds", async () => {
        const emailer = new InMemoryEmailer();
        const cms = { publicAuth: { emailer } } as unknown as ControlCms;

        await expect(postEmailTest(req({ to: "ada@example.com", kind: "other" }), cms)).rejects.toThrow(InvalidParam);
        expect(emailer.sent).toHaveLength(0);
    });
});
