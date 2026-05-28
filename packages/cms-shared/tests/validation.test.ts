import { describe, test, expect } from "bun:test";
import {
    isValidPathFormat,
    isValidSnippetIdentifier,
    isValidCustomElementTag,
} from "src/socle/utils/validation";

describe("isValidPathFormat", () => {
    test("accepts root", () => {
        expect(isValidPathFormat("/")).toBe(true);
    });

    test.each([
        ["/about"],
        ["/a/b/c"],
        ["/docs/2024/post"],
        ["/trailing-dash-ok"],
    ])("accepts %s", (path) => {
        expect(isValidPathFormat(path)).toBe(true);
    });

    test("rejects empty string", () => {
        expect(isValidPathFormat("")).toBe(false);
    });

    test("rejects non-string", () => {
        expect(isValidPathFormat(null as unknown as string)).toBe(false);
        expect(isValidPathFormat(undefined as unknown as string)).toBe(false);
        expect(isValidPathFormat(123 as unknown as string)).toBe(false);
    });

    test("rejects paths that don't start with /", () => {
        expect(isValidPathFormat("about")).toBe(false);
        expect(isValidPathFormat("./about")).toBe(false);
    });

    test("rejects query / fragment / route params", () => {
        expect(isValidPathFormat("/a?b=1")).toBe(false);
        expect(isValidPathFormat("/a#top")).toBe(false);
        expect(isValidPathFormat("/a/:id")).toBe(false);
    });

    test("rejects consecutive slashes", () => {
        expect(isValidPathFormat("//")).toBe(false);
        expect(isValidPathFormat("/a//b")).toBe(false);
    });

    test("rejects trailing slash (except the root)", () => {
        expect(isValidPathFormat("/about/")).toBe(false);
    });

    test("rejects characters outside [a-zA-Z0-9-/]", () => {
        expect(isValidPathFormat("/my_page")).toBe(false);   // underscore
        expect(isValidPathFormat("/my page")).toBe(false);   // space
        expect(isValidPathFormat("/robots.txt")).toBe(false); // dot
        expect(isValidPathFormat("/café")).toBe(false);      // non-ASCII
        expect(isValidPathFormat("/a+b")).toBe(false);       // plus
        expect(isValidPathFormat("/a%20b")).toBe(false);     // percent
    });

    test("accepts dashes and mixed case", () => {
        expect(isValidPathFormat("/MyPage")).toBe(true);
        expect(isValidPathFormat("/my-page")).toBe(true);
        expect(isValidPathFormat("/Page-123")).toBe(true);
        expect(isValidPathFormat("/a-b/c-d")).toBe(true);
    });

    test("rejects relative path traversal", () => {
        expect(isValidPathFormat("/..")).toBe(false);
        expect(isValidPathFormat("/a/..")).toBe(false);
    });
});

describe("isValidSnippetIdentifier", () => {
    test.each([
        ["hero"],
        ["hero-v1"],
        ["a"],
        ["a-b-c"],
        ["1"],
        ["hero-2"],
        ["v1-card"],
    ])("accepts valid kebab-case %p", (id) => {
        expect(isValidSnippetIdentifier(id)).toBe(true);
    });

    test("rejects empty string", () => {
        expect(isValidSnippetIdentifier("")).toBe(false);
    });

    test("rejects non-string", () => {
        expect(isValidSnippetIdentifier(null as unknown as string)).toBe(false);
        expect(isValidSnippetIdentifier(undefined as unknown as string)).toBe(false);
    });

    test.each([
        ["Hero"],       // uppercase
        ["HERO"],       // all caps
        ["HeroV1"],     // camelCase
    ])("rejects non-lowercase %p", (id) => {
        expect(isValidSnippetIdentifier(id)).toBe(false);
    });

    test.each([
        ["-hero"],      // leading dash
        ["hero-"],      // trailing dash
        ["hero--v1"],   // double dash
        ["--"],         // dashes only
    ])("rejects malformed dashes %p", (id) => {
        expect(isValidSnippetIdentifier(id)).toBe(false);
    });

    test.each([
        ["hero v1"],    // space
        ["hero_v1"],    // underscore
        ["hero.v1"],    // dot
        ["hero/v1"],    // slash
        ["héro"],       // non-ASCII
    ])("rejects forbidden characters %p", (id) => {
        expect(isValidSnippetIdentifier(id)).toBe(false);
    });
});

describe("isValidCustomElementTag", () => {
    test.each([
        ["my-card"],
        ["w13c-button"],
        ["p9r-input"],
        ["a-b"],
        ["a-b-c"],
        ["app-v2"],
    ])("accepts valid custom-element name %p", (tag) => {
        expect(isValidCustomElementTag(tag)).toBe(true);
    });

    test("rejects empty string and non-string", () => {
        expect(isValidCustomElementTag("")).toBe(false);
        expect(isValidCustomElementTag(null as unknown as string)).toBe(false);
    });

    test.each([
        ["card"],       // no dash — required by spec
        ["button"],
        ["hero"],
    ])("rejects names without a dash %p", (tag) => {
        expect(isValidCustomElementTag(tag)).toBe(false);
    });

    test.each([
        ["1-card"],     // leading digit
        ["-card"],      // leading dash
        ["My-Card"],    // uppercase
        ["my_card"],    // underscore instead of dash
        ["my-card-"],   // trailing dash
        ["my--card"],   // double dash
    ])("rejects malformed tags %p", (tag) => {
        expect(isValidCustomElementTag(tag)).toBe(false);
    });
});
