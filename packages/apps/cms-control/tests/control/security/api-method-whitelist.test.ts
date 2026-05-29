import { describe, test, expect } from "bun:test";

// `serveApi` uses the second-to-last `.`-delimited segment of each filename
// as the HTTP method. Without a whitelist, a typo like `foo.typo.ts` would
// silently register a handler under an arbitrary method, bypassing any
// method-keyed auth or write-guard logic. Assert the router guards against
// this — either via a literal allow-list or by skipping unknown methods.
describe("API routing guards HTTP methods", () => {
    test("serveApiFolder whitelists HTTP methods", async () => {
        const src = await Bun.file("packages/apps/cms-control/src/core/registerEndpoints/serveApiFolder.ts").text();

        // Either a whitelist literal appears, or the code throws on unknown.
        const hasWhitelist =
            /["']GET["']\s*,\s*["']POST["']/i.test(src) ||
            /ALLOWED_METHODS|VALID_METHODS|METHOD_WHITELIST/i.test(src);
        const throwsOnUnknown = /throw new Error\([^)]*method/i.test(src);
        expect(hasWhitelist || throwsOnUnknown).toBe(true);
    });
});
