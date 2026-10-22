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

describe("validateSettingsPatch — system Page references", () => {
    test("accepts stable contributed Page references", () => {
        const login = {
            kind: "contribution" as const,
            sourceId: "ulvia.official",
            contributionId: "ulvia-official",
            pageId: "login",
        };

        expect(validateSettingsPatch({ site: { login } }).site?.login).toEqual(login);
    });

    test("rejects malformed contributed Page references", () => {
        expect(() =>
            validateSettingsPatch({
                site: {
                    login: {
                        kind: "contribution",
                        sourceId: "Ulvia Official",
                        contributionId: "ulvia-official",
                        pageId: "login",
                    },
                },
            } as never),
        ).toThrow(ContentValidationError);
    });
});
