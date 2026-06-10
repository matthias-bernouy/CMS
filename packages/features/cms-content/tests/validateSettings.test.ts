import { describe, test, expect } from "bun:test";
import { validateSettingsPatch, ContentValidationError } from "@bernouy/cms-content";

describe("validateSettingsPatch — CSP origins", () => {
    test("normalizes each entry to its URL.origin", () => {
        const out = validateSettingsPatch({ security: { connectExtras: ["https://api.example.com", "https://x.supabase.co/rest/v1/"], mediaExtras: [] } });
        expect(out.security?.connectExtras).toEqual(["https://api.example.com", "https://x.supabase.co"]);
    });

    test("strips default ports and trailing paths", () => {
        const out = validateSettingsPatch({ security: { connectExtras: ["https://example.com:443/foo"], mediaExtras: [] } });
        expect(out.security?.connectExtras).toEqual(["https://example.com"]);
    });

    test("preserves non-default ports", () => {
        const out = validateSettingsPatch({ security: { connectExtras: ["http://localhost:5002"], mediaExtras: [] } });
        expect(out.security?.connectExtras).toEqual(["http://localhost:5002"]);
    });

    test("dedupes entries that normalize to the same origin", () => {
        const out = validateSettingsPatch({ security: { connectExtras: ["https://x.com", "https://x.com:443/foo", "https://x.com/bar"], mediaExtras: [] } });
        expect(out.security?.connectExtras).toEqual(["https://x.com"]);
    });

    test("rejects an unparseable URL", () => {
        expect(() => validateSettingsPatch({ security: { connectExtras: ["not-a-url"], mediaExtras: [] } })).toThrow(ContentValidationError);
    });

    test("passes through a patch without a security section", () => {
        const patch = { site: { name: "Hi" } } as any;
        expect(validateSettingsPatch(patch)).toEqual(patch);
    });
});
