import { describe, test, expect } from "bun:test";
import { buildCspContent } from "@bernouy/http-runner";

describe("buildCspContent", () => {
    test("emits the baseline directives with no extras (default arg)", () => {
        const csp = buildCspContent();
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("script-src 'self'");
        expect(csp).toContain("style-src 'self' 'unsafe-inline'");
        expect(csp).toContain("img-src 'self' data: https: blob:");
        expect(csp).toContain("base-uri 'self'");
        expect(csp).toContain("form-action 'self'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
    });

    test("omits connect-src and media-src when both extras are empty", () => {
        const csp = buildCspContent({ connectExtras: [], mediaExtras: [] });
        expect(csp).not.toContain("connect-src");
        expect(csp).not.toContain("media-src");
    });

    test("emits connect-src 'self' <urls> when connectExtras is non-empty", () => {
        const csp = buildCspContent({
            connectExtras: ["https://api.example.com", "https://x.supabase.co"],
            mediaExtras: [],
        });
        expect(csp).toContain("connect-src 'self' https://api.example.com https://x.supabase.co");
    });

    test("emits media-src 'self' <urls> when mediaExtras is non-empty", () => {
        const csp = buildCspContent({
            connectExtras: [],
            mediaExtras: ["https://cdn.example.com"],
        });
        expect(csp).toContain("media-src 'self' https://cdn.example.com");
    });

    test("emits frame-src 'self' <urls> when frameExtras is non-empty", () => {
        const csp = buildCspContent({
            connectExtras: [],
            mediaExtras: [],
            frameExtras: ["https://connect-js.stripe.com"],
        });
        expect(csp).toContain("frame-src 'self' https://connect-js.stripe.com");
    });

    test("emits both directives when both extras are non-empty", () => {
        const csp = buildCspContent({
            connectExtras: ["https://api.example.com"],
            mediaExtras: ["https://cdn.example.com"],
        });
        expect(csp).toContain("connect-src 'self' https://api.example.com");
        expect(csp).toContain("media-src 'self' https://cdn.example.com");
    });

    test("baseline output (no extras) matches the canonical constant", () => {
        const expected =
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https: blob:; " +
            "base-uri 'self'; form-action 'self'; " +
            "object-src 'none'; frame-ancestors 'none'";
        expect(buildCspContent()).toBe(expected);
    });

    test("can omit header-only directives for meta CSP", () => {
        const csp = buildCspContent(undefined, { includeHeaderOnlyDirectives: false });
        expect(csp).not.toContain("frame-ancestors");
        expect(csp).toContain("form-action 'self'");
    });

    test("directives are joined with '; ' separator", () => {
        const csp = buildCspContent();
        expect(csp.split("; ").length).toBe(8);
    });
});
