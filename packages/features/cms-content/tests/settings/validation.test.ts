import { describe, test, expect } from "bun:test";
import { validateSettingsPatch, ContentValidationError } from "@bernouy/cms-content";

test("Content settings reject security policy owned by Edge", () => {
    expect(() => validateSettingsPatch({ security: { connectExtras: [] } } as never)).toThrow(ContentValidationError);
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
    test("accepts stable site Page references", () => {
        const login = {
            kind: "site" as const,
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
