import { describe, test, expect } from "bun:test";
import { escapeRegex } from "@bernouy/cms-content";

describe("escapeRegex", () => {
    test("backslash-prefixes every regex metacharacter", () => {
        for (const c of [".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]) {
            expect(escapeRegex(c)).toBe("\\" + c);
        }
    });

    test("leaves an alphanumeric/kebab string unchanged", () => {
        expect(escapeRegex("hello-world_42")).toBe("hello-world_42");
    });

    test("the escaped value matches itself literally, not as a pattern", () => {
        const value = "a.b(c)*";
        const re = new RegExp(`^${escapeRegex(value)}$`);
        expect(re.test("a.b(c)*")).toBe(true);
        expect(re.test("aXb(c)")).toBe(false);   // '.' / '*' must not act as wildcards
    });
});
