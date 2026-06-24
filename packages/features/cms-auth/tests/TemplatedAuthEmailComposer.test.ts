import { describe, expect, test } from "bun:test";
import { TemplatedAuthEmailComposer } from "@bernouy/cms-auth";

describe("TemplatedAuthEmailComposer", () => {
    test("renders safe tokens and escapes token values in HTML", async () => {
        const composer = new TemplatedAuthEmailComposer({
            readTemplates: async () => ({
                emailVerification: {
                    subject: "Verify {{siteName}} for {{recipientEmail}}",
                    html:    "<a href=\"{{actionUrl}}\">{{recipientName}}</a> {{siteName}} {{token}}",
                },
                passwordReset: emptyTemplate(),
            }),
            fallback: fallbackComposer(),
        });

        const out = await composer.compose({
            kind:      "email_verification",
            to:        { email: "ada@example.com", displayName: "Ada <Admin>" },
            actionUrl: "https://site.test/verify?x=1&name=<ada>",
            token:     "secret-token",
            expiresAt: new Date("2026-06-24T10:00:00.000Z"),
            siteName:  "Site <CMS>",
        });

        expect(out.subject).toBe("Verify Site <CMS> for ada@example.com");
        expect(out.text).toBe("Fallback text");
        expect(out.html).toBe("<a href=\"https://site.test/verify?x=1&amp;name=&lt;ada&gt;\">Ada &lt;Admin&gt;</a> Site &lt;CMS&gt; {{token}}");
    });

    test("falls back field by field when template fields are empty", async () => {
        const composer = new TemplatedAuthEmailComposer({
            readTemplates: async () => ({
                emailVerification: {
                    subject: "",
                    html:    "   ",
                },
                passwordReset: emptyTemplate(),
            }),
            fallback: fallbackComposer(),
        });

        const out = await composer.compose(baseInput("email_verification"));

        expect(out.subject).toBe("Fallback subject");
        expect(out.text).toBe("Fallback text");
        expect(out.html).toBe("<p>Fallback html</p>");
    });

    test("uses the selected auth template kind", async () => {
        const composer = new TemplatedAuthEmailComposer({
            readTemplates: async () => ({
                emailVerification: { subject: "Verify", html: "" },
                passwordReset:     { subject: "Reset",  html: "" },
            }),
            fallback: fallbackComposer(),
        });

        const out = await composer.compose(baseInput("password_reset"));

        expect(out.subject).toBe("Reset");
        expect(out.text).toBe("Fallback text");
    });
});

function emptyTemplate() {
    return { subject: "", html: "" };
}

function fallbackComposer() {
    return {
        async compose(input: any) {
            return {
                to:      input.to,
                subject: "Fallback subject",
                text:    "Fallback text",
                html:    "<p>Fallback html</p>",
            };
        },
    };
}

function baseInput(kind: "email_verification" | "password_reset") {
    return {
        kind,
        to:        { email: "ada@example.com", displayName: "Ada" },
        actionUrl: "https://site.test/action",
        token:     "secret-token",
        expiresAt: new Date("2026-06-24T10:00:00.000Z"),
        siteName:  "Site",
    };
}
