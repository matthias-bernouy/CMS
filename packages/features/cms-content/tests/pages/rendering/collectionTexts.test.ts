import { expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { renderCollectionTexts, type CollectionTextSource } from "../../../src/exports/rendering";

const source: CollectionTextSource = {
    collection: {
        collectionId: "test",
        locale: "en",
        texts: [{ id: "hello", parameters: { name: "string" }, values: { en: "Hello {name}", fr: "Bonjour {name}" } }],
    },
    parameters: { name: '<img src=x onerror="alert(1)">' },
};
function root(markup: string) {
    return parseHTML(`<html><body>${markup}</body></html>`).document.body;
}

test("server interpolation escapes text and attributes, preserves unrelated bindings and removes markers", () => {
    const body = root(
        '<p>{{ cms.i18n.test.hello }}</p><input placeholder="{{ cms.i18n.test.hello }}"><b>{{ order.total }}</b>',
    );
    renderCollectionTexts(body, "fr-CA", [source]);
    expect(body.querySelector("p")!.textContent).toBe('Bonjour <img src=x onerror="alert(1)">');
    expect(body.querySelector("input")!.getAttribute("placeholder")).toBe('Bonjour <img src=x onerror="alert(1)">');
    expect(body.querySelector("img")).toBeNull();
    expect(body.querySelector("b")!.textContent).toBe("{{ order.total }}");
    expect(body.innerHTML).not.toContain("cms.i18n");
    expect(root(body.innerHTML).querySelector("img")).toBeNull();
});

test("render contexts do not share locale or overrides", () => {
    const french = root("<p>{{ cms.i18n.test.hello }}</p>");
    const english = root("<p>{{ cms.i18n.test.hello }}</p>");
    renderCollectionTexts(french, "fr", [{ ...source, overrides: { hello: { fr: "Salut {name}" } } }]);
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
    '<input value="{{ cms.i18n.test.hello }}">',
])("rejects unsupported server expressions or contexts: %s", (markup) => {
    expect(() => renderCollectionTexts(root(markup), "en", [source])).toThrow();
});

test("mixed server and business expressions preserve children and attribute bindings", () => {
    const body = root(
        '<p>{{ cms.i18n.test.hello }}: <b>{{ order.total }}</b> {{ cmsData.title }}</p><input placeholder="{{ cms.i18n.test.hello }} — {{ order.label }}">',
    );
    renderCollectionTexts(body, "en", [{ ...source, parameters: { name: "Alex" } }]);
    expect(body.querySelector("p")!.innerHTML).toBe("Hello Alex: <b>{{ order.total }}</b> {{ cmsData.title }}");
    expect(body.querySelector("input")!.getAttribute("placeholder")).toBe("Hello Alex — {{ order.label }}");
});

test("rejects duplicate catalogues and browser expressions supplied as parameters", () => {
    expect(() => renderCollectionTexts(root(""), "en", [source, source])).toThrow("Duplicate");
    expect(() =>
        renderCollectionTexts(root("<p>{{ cms.i18n.test.hello }}</p>"), "en", [
            { ...source, parameters: { name: "{{ secret.value }}" } },
        ]),
    ).toThrow("binding delimiters");
});
