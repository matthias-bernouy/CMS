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
    test("matches the proxy path of the given provider", () => {
        const re = dataProviderRefRegex("hub")!;
        expect(re.test('<base-fetch url="/.cms/data/hub/users"></base-fetch>')).toBe(true);
    });

    test("does not match a longer-id collision on the same prefix", () => {
        const re = dataProviderRefRegex("hub")!;
        // `hub-v2` after `/.cms/data/` shares the prefix but the trailing
        // `/` boundary in the regex prevents the false positive.
        expect(re.test('"/.cms/data/hub-v2/users"')).toBe(false);
    });

    test("escapes regex metacharacters in the providerId", () => {
        const re = dataProviderRefRegex("a.b")!;
        expect(re.test('"/.cms/data/a.b/x"')).toBe(true);
        expect(re.test('"/.cms/data/aXb/x"')).toBe(false);
    });

    test("does not match the upstream URL even if it appears in content", () => {
        // Providers used to be referenced by their raw `server` URL; this
        // confirms the rewrite won't produce false matches if a bloc still
        // mentions the upstream host as plaintext somewhere.
        const re = dataProviderRefRegex("hub")!;
        expect(re.test('"https://api.hub.com/v1/users"')).toBe(false);
    });

    test("returns null for empty / whitespace input", () => {
        expect(dataProviderRefRegex("")).toBeNull();
        expect(dataProviderRefRegex("   ")).toBeNull();
    });
});

describe("findConsumersInCollections", () => {
    test("collects matching pages, templates, snippets and ignores others", () => {
        const result = findConsumersInCollections(
            "hub",
            [
                page("/", "Home",   '<base-fetch url="/.cms/data/hub/users"></base-fetch>'),
                page("/about", "About", "<p>plain text</p>"),
                page("/other", "Other", '<base-fetch url="/.cms/data/other/x"></base-fetch>'),
            ],
            [
                template("t1", "Template 1", 'fetch("/.cms/data/hub/posts")'),
                template("t2", "Template 2", "no refs"),
            ],
            [
                snippet("s1", "Snippet 1", '"/.cms/data/hub/me"'),
                snippet("s2", "Snippet 2", '"/.cms/data/hub-v2/users"'),
            ],
        );
        expect(result.pages).toEqual    ([{ path: "/", title: "Home" }]);
        expect(result.templates).toEqual([{ identifier: "t1", name: "Template 1" }]);
        expect(result.snippets).toEqual ([{ identifier: "s1", name: "Snippet 1" }]);
    });

    test("returns empty buckets when nothing references the provider", () => {
        const result = findConsumersInCollections("hub", [
            page("/", "Home", "<p>nothing</p>"),
        ], [], []);
        expect(result.pages).toEqual([]);
        expect(result.templates).toEqual([]);
        expect(result.snippets).toEqual([]);
    });

    test("returns empty buckets when the providerId is empty", () => {
        const result = findConsumersInCollections("", [
            page("/", "Home", '<base-fetch url="/.cms/data/hub/users"></base-fetch>'),
        ], [], []);
        expect(result.pages).toEqual([]);
        expect(result.templates).toEqual([]);
        expect(result.snippets).toEqual([]);
    });
});
