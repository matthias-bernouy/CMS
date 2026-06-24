import { describe, expect, test } from "bun:test";
import { InMemoryEmailer } from "@bernouy/cms-auth";
import type { ControlCms } from "cms-control/ControlCms";
import postEmailTest from "cms-control/api/system/email-test.post";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

const req = (body: Record<string, unknown>) => new Request("http://control/api/system/email-test", {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify(body),
});

describe("POST /api/system/email-test", () => {
    test("sends a test email through the configured public auth emailer", async () => {
        const emailer = new InMemoryEmailer();
        const cms = { publicAuth: { emailer } } as unknown as ControlCms;

        const res = await postEmailTest(req({ to: "ada@example.com" }), cms);

        expect(res.status).toBe(200);
        expect(emailer.sent).toHaveLength(1);
        expect(emailer.sent[0]).toMatchObject({
            to:      { email: "ada@example.com" },
            subject: "CMS email test",
        });
    });

    test("rejects invalid recipient emails", async () => {
        const emailer = new InMemoryEmailer();
        const cms = { publicAuth: { emailer } } as unknown as ControlCms;

        await expect(postEmailTest(req({ to: "invalid" }), cms)).rejects.toThrow(InvalidParam);
        expect(emailer.sent).toHaveLength(0);
    });
});
