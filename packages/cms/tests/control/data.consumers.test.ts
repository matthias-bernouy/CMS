import { describe, expect, test } from "bun:test";
import { dataProviderRefRegex, findConsumersInCollections } from "src/socle/utils/dataProviderRefs";
import type { TPage, TSnippet, TTemplate } from "src/socle/interfaces/models";

const FROZEN = new Date(0);

function page(path: string, title: string, content: string): TPage {
    return { id: path, path, title, content, description: "", visible: true, tags: [] };
}
function template(identifier: string, name: string, content: string): TTemplate {
    return { id: identifier, identifier, name, description: "", category: "", content, createdAt: FROZEN };
}
function snippet(identifier: string, name: string, content: string): TSnippet {
    return { id: identifier, identifier, name, description: "", category: "", content, createdAt: FROZEN, updatedAt: FROZEN };
}

describe("dataProviderRefRegex", () => {
    test("matches a server URL appearing as a fetch attribute", () => {
        const re = dataProviderRefRegex("https://api.hub.com/v1")!;
        expect(re.test('<base-fetch url="https://api.hub.com/v1/users"></base-fetch>')).toBe(true);
    });

    test("matches the bare server URL (no path) at end of value", () => {
        const re = dataProviderRefRegex("https://api.hub.com/v1")!;
        expect(re.test('"https://api.hub.com/v1"')).toBe(true);
        expect(re.test('https://api.hub.com/v1 ')).toBe(true);
    });

    test("does not match a longer-prefix path on the same host", () => {
        const re = dataProviderRefRegex("https://api.hub.com/v1")!;
        expect(re.test("https://api.hub.com/v10/x")).toBe(false);
    });

    test("normalises trailing slashes on the input", () => {
        const re = dataProviderRefRegex("https://api.hub.com/v1/")!;
        expect(re.test("https://api.hub.com/v1/users")).toBe(true);
        expect(re.test("https://api.hub.com/v10/users")).toBe(false);
    });

    test("escapes regex metacharacters in the URL", () => {
        const re = dataProviderRefRegex("https://api.hub.com/a.b")!;
        expect(re.test("https://api.hub.com/a.b/x")).toBe(true);
        expect(re.test("https://api.hub.com/aXb/x")).toBe(false);
    });

    test("returns null for empty / whitespace input", () => {
        expect(dataProviderRefRegex("")).toBeNull();
        expect(dataProviderRefRegex("   ")).toBeNull();
    });
});

describe("findConsumersInCollections", () => {
    test("collects matching pages, templates, snippets and ignores others", () => {
        const result = findConsumersInCollections(
            "https://api.hub.com/v1",
            [
                page("/", "Home",   '<base-fetch url="https://api.hub.com/v1/users"></base-fetch>'),
                page("/about", "About", '<p>plain text</p>'),
                page("/other", "Other", '<base-fetch url="https://other.api/x"></base-fetch>'),
            ],
            [
                template("t1", "Template 1", 'fetch("https://api.hub.com/v1/posts")'),
                template("t2", "Template 2", "no refs"),
            ],
            [
                snippet("s1", "Snippet 1", '"https://api.hub.com/v1"'),
                snippet("s2", "Snippet 2", '"https://api.hub.com/v10"'),
            ],
        );
        expect(result.pages).toEqual    ([{ path: "/", title: "Home" }]);
        expect(result.templates).toEqual([{ identifier: "t1", name: "Template 1" }]);
        expect(result.snippets).toEqual ([{ identifier: "s1", name: "Snippet 1" }]);
    });

    test("returns empty buckets when nothing references the URL", () => {
        const result = findConsumersInCollections("https://api.hub.com/v1", [
            page("/", "Home", "<p>nothing</p>"),
        ], [], []);
        expect(result.pages).toEqual([]);
        expect(result.templates).toEqual([]);
        expect(result.snippets).toEqual([]);
    });

    test("returns empty buckets when the server URL is empty (provider has no server)", () => {
        const result = findConsumersInCollections("", [
            page("/", "Home", '<base-fetch url="https://api.hub.com/v1/users"></base-fetch>'),
        ], [], []);
        expect(result.pages).toEqual([]);
        expect(result.templates).toEqual([]);
        expect(result.snippets).toEqual([]);
    });
});
