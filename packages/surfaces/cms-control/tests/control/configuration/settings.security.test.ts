import { describe, test, expect } from "bun:test";
import { parseSettingsUpdateDto } from "cms-control/core/validation/settings/parseUpdateDto";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { defaultSystem } from "@bernouy/cms-content";

describe("parseSettingsUpdateDto — system pages", () => {
    test("coerces all system page paths to page references", () => {
        const dto = parseSettingsUpdateDto({
            "site.notFound": "/not-found",
            "site.forbidden": "/forbidden",
            "site.serverError": "/error",
            "site.login": "/sign-in",
        });

        expect(dto.site?.notFound).toEqual({ path: "/not-found" });
        expect(dto.site?.forbidden).toEqual({ path: "/forbidden" });
        expect(dto.site?.serverError).toEqual({ path: "/error" });
        expect(dto.site?.login).toEqual({ path: "/sign-in" });
    });

    test("coerces empty system page paths to null", () => {
        const dto = parseSettingsUpdateDto({
            "site.notFound": "",
            "site.forbidden": "",
            "site.serverError": "",
            "site.login": "",
        });

        expect(dto.site?.notFound).toBeNull();
        expect(dto.site?.forbidden).toBeNull();
        expect(dto.site?.serverError).toBeNull();
        expect(dto.site?.login).toBeNull();
    });
});

describe("parseSettingsUpdateDto — theme", () => {
    test("accepts the structured theme document", () => {
        const theme = defaultSystem().theme;
        expect(parseSettingsUpdateDto({ theme })).toEqual({ theme });
    });
});

// Parsing/coercion only: split the multiline textarea into trimmed lines.
// The URL-validity + origin-normalization + dedupe RULE moved to
// cms-content's `validateSettingsPatch` (see its test).
describe("parseSettingsUpdateDto — security section (parsing)", () => {
    test("returns empty arrays when both fields are empty strings", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "", "security.mediaExtras": "" });
        expect(dto.security?.connectExtras).toEqual([]);
        expect(dto.security?.mediaExtras).toEqual([]);
    });

    test("splits one entry per line", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "https://a.com\nhttps://b.com" });
        expect(dto.security?.connectExtras).toEqual(["https://a.com", "https://b.com"]);
    });

    test("skips empty / whitespace lines", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "https://a.com\n\n   \nhttps://b.com\n" });
        expect(dto.security?.connectExtras).toEqual(["https://a.com", "https://b.com"]);
    });

    test("accepts CRLF line endings", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "https://a.com\r\nhttps://b.com" });
        expect(dto.security?.connectExtras).toEqual(["https://a.com", "https://b.com"]);
    });

    test("rejects a non-string body value", () => {
        expect(() => parseSettingsUpdateDto({ "security.connectExtras": 42 as unknown as string })).toThrow(
            InvalidParam,
        );
    });

    test("only sets connectExtras when only that key is present (partial update)", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "https://api.x.com" });
        expect(dto.security?.connectExtras).toEqual(["https://api.x.com"]);
        expect(dto.security?.mediaExtras).toBeUndefined();
    });

    test("does not emit a security section when no security key is present", () => {
        const dto = parseSettingsUpdateDto({ "site.name": "Hello" });
        expect(dto.security).toBeUndefined();
    });

    test("treats connectExtras and mediaExtras independently", () => {
        const dto = parseSettingsUpdateDto({
            "security.connectExtras": "https://api.x.com",
            "security.mediaExtras": "https://cdn.x.com",
        });
        expect(dto.security?.connectExtras).toEqual(["https://api.x.com"]);
        expect(dto.security?.mediaExtras).toEqual(["https://cdn.x.com"]);
    });

    test("ignores legacy editor.shell updates", () => {
        const dto = parseSettingsUpdateDto({
            "editor.layoutCategory": "Layouts",
            "editor.shell": "<cms-binding-core>{{CONTENT}}</cms-binding-core>",
        });
        expect(dto.editor).toEqual({ layoutCategory: "Layouts" });
    });
});

describe("parseSettingsUpdateDto — email section", () => {
    test("parses runtime SMTP settings from dotted form fields", () => {
        const dto = parseSettingsUpdateDto({
            "email.enabled": "true",
            "email.fromEmail": "no-reply@example.com",
            "email.fromName": "CMS",
            "email.replyTo": "support@example.com",
            "email.transport": "smtp",
            "email.smtp.host": "smtp.example.com",
            "email.smtp.port": "465",
            "email.smtp.secure": "true",
            "email.smtp.username": "postmaster@example.com",
            "email.smtp.passwordSecretRef": "${SMTP_PASSWORD}",
            "email.templates.emailVerification.subject": "Verify {{siteName}}",
            "email.templates.emailVerification.html": '<a href="{{actionUrl}}">Verify</a>',
            "email.templates.passwordReset.subject": "Reset {{siteName}}",
            "email.templates.passwordReset.html": '<a href="{{actionUrl}}">Reset</a>',
        });

        expect(dto.email).toEqual({
            enabled: true,
            fromEmail: "no-reply@example.com",
            fromName: "CMS",
            replyTo: "support@example.com",
            transport: "smtp",
            smtp: {
                host: "smtp.example.com",
                port: 465,
                secure: true,
                username: "postmaster@example.com",
                passwordSecretRef: "${SMTP_PASSWORD}",
            },
            templates: {
                emailVerification: {
                    subject: "Verify {{siteName}}",
                    html: '<a href="{{actionUrl}}">Verify</a>',
                },
                passwordReset: {
                    subject: "Reset {{siteName}}",
                    html: '<a href="{{actionUrl}}">Reset</a>',
                },
            },
        });
    });

    test("parses checkbox false values", () => {
        const dto = parseSettingsUpdateDto({
            "email.enabled": "false",
            "email.smtp.secure": "false",
        });

        expect(dto.email?.enabled).toBe(false);
        expect(dto.email?.smtp.secure).toBe(false);
        expect(dto.email?.templates.emailVerification.subject).toBe("");
    });

    test("parses checkbox fallback arrays from duplicated form fields", () => {
        const dto = parseSettingsUpdateDto({
            "email.enabled": ["false", "true"],
            "email.smtp.secure": ["false", "true"],
        });

        expect(dto.email?.enabled).toBe(true);
        expect(dto.email?.smtp.secure).toBe(true);
    });

    test("rejects invalid boolean and port values", () => {
        expect(() => parseSettingsUpdateDto({ "email.enabled": "maybe" })).toThrow(InvalidParam);
        expect(() => parseSettingsUpdateDto({ "email.smtp.port": "abc" })).toThrow(InvalidParam);
    });
});
