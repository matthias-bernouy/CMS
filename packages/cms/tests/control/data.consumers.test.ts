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
    test("matches the canonical V2 URN", () => {
        const re = dataProviderRefRegex("hub-api");
        expect(re.test('data-source="cms:schema:hub-api:GET:/users"')).toBe(true);
    });

    test("matches the V1 (provider only) URN at end of value", () => {
        const re = dataProviderRefRegex("hub-api");
        expect(re.test('cms:schema:hub-api"')).toBe(true);
        expect(re.test('cms:schema:hub-api ')).toBe(true);
    });

    test("does not match a longer provider id sharing the same prefix", () => {
        const re = dataProviderRefRegex("hub");
        expect(re.test('cms:schema:hub-api:GET:/x')).toBe(false);
    });

    test("does not match a different scheme", () => {
        const re = dataProviderRefRegex("hub");
        expect(re.test('cms:secret:hub')).toBe(false);
    });

    test("escapes regex metacharacters in id", () => {
        const re = dataProviderRefRegex("a.b");
        expect(re.test('cms:schema:a.b:GET')).toBe(true);
        expect(re.test('cms:schema:axb:GET')).toBe(false);
    });
});

describe("findConsumersInCollections", () => {
    test("collects matching pages, templates, snippets and ignores others", () => {
        const result = findConsumersInCollections(
            "hub-api",
            [
                page("/", "Home",   '<base-fetch data-source="cms:schema:hub-api:GET:/users"></base-fetch>'),
                page("/about", "About", '<p>plain text</p>'),
                page("/other", "Other", '<base-fetch data-source="cms:schema:other-api:GET:/x"></base-fetch>'),
            ],
            [
                template("t1", "Template 1", 'cms:schema:hub-api:GET:/posts'),
                template("t2", "Template 2", 'no refs'),
            ],
            [
                snippet("s1", "Snippet 1", 'cms:schema:hub-api'),
                snippet("s2", "Snippet 2", 'cms:schema:hub-api-2'),
            ],
        );
        expect(result.pages).toEqual    ([{ path: "/", title: "Home" }]);
        expect(result.templates).toEqual([{ identifier: "t1", name: "Template 1" }]);
        expect(result.snippets).toEqual ([{ identifier: "s1", name: "Snippet 1" }]);
    });

    test("returns empty buckets when nothing references the id", () => {
        const result = findConsumersInCollections("hub-api", [
            page("/", "Home", '<p>nothing</p>'),
        ], [], []);
        expect(result.pages).toEqual([]);
        expect(result.templates).toEqual([]);
        expect(result.snippets).toEqual([]);
    });
});
