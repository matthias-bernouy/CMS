import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { renderCollectionTexts, type CollectionTextSource } from "@bernouy/cms-repository/collections/content";

const source: CollectionTextSource = {
    collection: {
        collectionId: "test",
        locale: "en",
        texts: [
            {
                id: "hello",
                label: "text.label.hello",
                category: "text.category.content",
                group: "text.group.general",
                values: { en: "Hello", fr: "Bonjour" },
            },
        ],
    },
};
function root(markup: string) {
    return parseHTML(`<html><body>${markup}</body></html>`).document.body;
}

test("server text replacement escapes text and attributes, preserves unrelated bindings and removes markers", () => {
    const body = root(
        '<p>{{ cms.i18n.test.hello }}</p><input placeholder="{{ cms.i18n.test.hello }}"><span aria-roledescription="{{ cms.i18n.test.hello }}"></span><input type="submit" value="{{ cms.i18n.test.hello }}"><b>{{ order.total }}</b>',
    );
    renderCollectionTexts(body, "fr-CA", [
        { ...source, overrides: { hello: { fr: 'Bonjour <img src=x onerror="alert(1)">' } } },
    ]);
    expect(body.querySelector("p")!.textContent).toBe('Bonjour <img src=x onerror="alert(1)">');
    expect(body.querySelector("input")!.getAttribute("placeholder")).toBe('Bonjour <img src=x onerror="alert(1)">');
    expect(body.querySelector("span")!.getAttribute("aria-roledescription")).toBe(
        'Bonjour <img src=x onerror="alert(1)">',
    );
    expect(body.querySelector('input[type="submit"]')!.getAttribute("value")).toBe(
        'Bonjour <img src=x onerror="alert(1)">',
    );
    expect(body.querySelector("img")).toBeNull();
    expect(body.querySelector("b")!.textContent).toBe("{{ order.total }}");
    expect(body.innerHTML).not.toContain("cms.i18n");
    expect(root(body.innerHTML).querySelector("img")).toBeNull();
});

test("render contexts do not share locale or overrides", () => {
    const french = root("<p>{{ cms.i18n.test.hello }}</p>");
    const english = root("<p>{{ cms.i18n.test.hello }}</p>");
    renderCollectionTexts(french, "fr", [{ ...source, overrides: { hello: { fr: "Salut" } } }]);
    renderCollectionTexts(english, "en", [source]);
    expect(french.textContent).toStartWith("Salut");
    expect(english.textContent).toStartWith("Hello");
});

test.each([
    '<a href="{{ cms.i18n.test.hello }}"></a>',
    "<script>{{ cms.i18n.test.hello }}</script>",
    "<template><p>{{ cms.i18n.test.hello }}</p></template>",
    "<p>{{ cms.i18n.other.hello }}</p>",
    "<p>{{ cms.i18n.test.hello | innerHTML }}</p>",
    "<p>{{ cms.i18n.test.hello(name) }}</p>",
    "<p>{{ cms.i18n.test.hello</p>",
    "<p>{{ cms.other.test }}</p>",
    '<input type="text" value="{{ cms.i18n.test.hello }}">',
])("rejects unsupported server expressions or contexts: %s", (markup) => {
    expect(() => renderCollectionTexts(root(markup), "en", [source])).toThrow();
});

test("mixed server and business expressions preserve children and attribute bindings", () => {
    const body = root(
        '<p>{{ cms.i18n.test.hello }}: <b>{{ order.total }}</b> {{ cmsData.title }}</p><input placeholder="{{ cms.i18n.test.hello }} — {{ order.label }}">',
    );
    renderCollectionTexts(body, "en", [source]);
    expect(body.querySelector("p")!.innerHTML).toBe("Hello: <b>{{ order.total }}</b> {{ cmsData.title }}");
    expect(body.querySelector("input")!.getAttribute("placeholder")).toBe("Hello — {{ order.label }}");
});

test("rejects duplicate catalogues and dynamic text overrides", () => {
    expect(() => renderCollectionTexts(root(""), "en", [source, source])).toThrow("Duplicate");
    expect(() =>
        renderCollectionTexts(root("<p>{{ cms.i18n.test.hello }}</p>"), "en", [
            { ...source, overrides: { hello: { en: "Hello {name}" } } },
        ]),
    ).toThrow("do not support interpolation");
});
