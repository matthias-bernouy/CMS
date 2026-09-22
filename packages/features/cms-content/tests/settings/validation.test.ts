import { describe, test, expect } from "bun:test";
import { validateSettingsPatch, ContentValidationError } from "@bernouy/cms-content";

describe("validateSettingsPatch — CSP origins", () => {
    test("normalizes each entry to its URL.origin", () => {
        const out = validateSettingsPatch({
            security: { connectExtras: ["https://api.example.com", "https://x.supabase.co/rest/v1/"], mediaExtras: [] },
        });
        expect(out.security?.connectExtras).toEqual(["https://api.example.com", "https://x.supabase.co"]);
    });

    test("strips default ports and trailing paths", () => {
        const out = validateSettingsPatch({
            security: { connectExtras: ["https://example.com:443/foo"], mediaExtras: [] },
        });
        expect(out.security?.connectExtras).toEqual(["https://example.com"]);
    });

    test("preserves non-default ports", () => {
        const out = validateSettingsPatch({ security: { connectExtras: ["http://localhost:5002"], mediaExtras: [] } });
        expect(out.security?.connectExtras).toEqual(["http://localhost:5002"]);
    });

    test("dedupes entries that normalize to the same origin", () => {
        const out = validateSettingsPatch({
            security: {
                connectExtras: ["https://x.com", "https://x.com:443/foo", "https://x.com/bar"],
                mediaExtras: [],
            },
        });
        expect(out.security?.connectExtras).toEqual(["https://x.com"]);
    });

    test("rejects an unparseable URL", () => {
        expect(() => validateSettingsPatch({ security: { connectExtras: ["not-a-url"], mediaExtras: [] } })).toThrow(
            ContentValidationError,
        );
    });

    test("passes through a patch without a security section", () => {
        const patch = { site: { name: "Hi" } } as any;
        expect(validateSettingsPatch(patch)).toEqual(patch);
    });
});

describe("validateSettingsPatch — canonical site host", () => {
    test("rejects the removed free-form site CSS field", () => {
        expect(() => validateSettingsPatch({ site: { theme: "body {}" } } as never)).toThrow(ContentValidationError);
    });

    test("normalizes an HTTP base URL while preserving its public path", () => {
        const out = validateSettingsPatch({ site: { host: " https://EXAMPLE.com:443/shop/ " } } as never);

        expect(out.site?.host).toBe("https://example.com/shop");
    });

    test("keeps an empty host as an explicit SEO opt-out", () => {
        const out = validateSettingsPatch({ site: { host: "  " } } as never);

        expect(out.site?.host).toBe("");
    });

    test.each([
        "example.com",
        "ftp://example.com",
        "https://user@example.com",
        "https://example.com?preview=true",
        "https://example.com#content",
    ])("rejects an unsafe public base URL: %s", (host) => {
        expect(() => validateSettingsPatch({ site: { host } } as never)).toThrow(ContentValidationError);
    });
});

describe("validateSettingsPatch — email settings", () => {
    test("passes through disabled email settings without requiring SMTP credentials", () => {
        const out = validateSettingsPatch({
            email: {
                enabled: false,
                fromEmail: "",
                fromName: "",
                replyTo: "",
                transport: "smtp",
                smtp: {
                    host: "",
                    port: 587,
                    secure: false,
                    username: "",
                    passwordSecretRef: "",
                },
            },
        });

        expect(out.email?.enabled).toBe(false);
    });

    test("accepts partial disabled email patches", () => {
        const out = validateSettingsPatch({ email: { enabled: false } as any });

        expect(out.email?.enabled).toBe(false);
        expect(out.email?.smtp.port).toBe(587);
    });

    test("accepts partial auth email template patches", () => {
        const out = validateSettingsPatch({
            email: {
                templates: {
                    emailVerification: { subject: "Verify {{siteName}}" },
                },
            } as any,
        });

        expect(out.email?.templates.emailVerification.subject).toBe("Verify {{siteName}}");
        expect(out.email?.templates.passwordReset.subject).toBe("");
    });

    test("accepts enabled email settings with a complete SMTP configuration", () => {
        const out = validateSettingsPatch({
            email: {
                enabled: true,
                fromEmail: "no-reply@example.com",
                fromName: "CMS",
                replyTo: "",
                transport: "smtp",
                smtp: {
                    host: "smtp.example.com",
                    port: 587,
                    secure: false,
                    username: "postmaster@example.com",
                    passwordSecretRef: "${SMTP_PASSWORD}",
                },
            },
        });

        expect(out.email?.smtp.host).toBe("smtp.example.com");
        expect(out.email?.smtp.port).toBe(587);
        expect(out.email?.smtp.secure).toBe(false);
    });

    test("rejects enabled email settings without a valid sender", () => {
        expect(() =>
            validateSettingsPatch({
                email: {
                    enabled: true,
                    fromEmail: "invalid",
                    fromName: "CMS",
                    replyTo: "",
                    transport: "smtp",
                    smtp: {
                        host: "smtp.example.com",
                        port: 587,
                        secure: false,
                        username: "user",
                        passwordSecretRef: "${SMTP_PASSWORD}",
                    },
                },
            }),
        ).toThrow(ContentValidationError);
    });

    test("rejects enabled email settings without a secret reference", () => {
        expect(() =>
            validateSettingsPatch({
                email: {
                    enabled: true,
                    fromEmail: "no-reply@example.com",
                    fromName: "CMS",
                    replyTo: "",
                    transport: "smtp",
                    smtp: {
                        host: "smtp.example.com",
                        port: 587,
                        secure: false,
                        username: "user",
                        passwordSecretRef: "SMTP_PASSWORD",
                    },
                },
            }),
        ).toThrow(ContentValidationError);
    });
});
