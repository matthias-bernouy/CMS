import { describe, test, expect } from "bun:test";

// registerAPIFolder uses `parts[1]?.toUpperCase()` as the HTTP method without
// any whitelist — a filename like `foo.typo.ts` would silently register a
// handler under an arbitrary method, bypassing any method-keyed auth or
// write-guard logic. Assert the routing code guards against this.
describe("API routing guards HTTP methods", () => {
    test("routing.ts whitelists HTTP methods", async () => {
        const src = await Bun.file("src/control/core/server/routing.ts").text();

        // Either a whitelist literal appears, or the code throws on unknown.
        const hasWhitelist =
            /["']GET["']\s*,\s*["']POST["']/i.test(src) ||
            /ALLOWED_METHODS|VALID_METHODS|METHOD_WHITELIST/i.test(src);
        const throwsOnUnknown = /throw new Error\([^)]*method/i.test(src);
        expect(hasWhitelist || throwsOnUnknown).toBe(true);
    });
});
