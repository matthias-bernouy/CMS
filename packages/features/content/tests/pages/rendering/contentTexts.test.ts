import { describe, expect, test } from "bun:test";
import { renderContentTexts } from "@bernouy/content/rendering";
import { parseHTML } from "linkedom";

const source = {
    namespace: "example.official/example",
    resolve: () => ({ label: "Translated label" }),
};

describe("renderContentTexts", () => {
    test("renders user-facing attributes on raw-text and embedded elements", () => {
        const { document } = parseHTML(
            '<html><body><textarea placeholder="{{ cms.i18n.example.official/example.label }}"></textarea>' +
                '<iframe title="{{ cms.i18n.example.official/example.label }}"></iframe></body></html>',
        );

        renderContentTexts(document.body, "en", [source]);

        expect(document.querySelector("textarea")?.getAttribute("placeholder")).toBe("Translated label");
        expect(document.querySelector("iframe")?.getAttribute("title")).toBe("Translated label");
    });

    test("still rejects server texts inside inert content", () => {
        const { document } = parseHTML(
            '<html><body><template><span title="{{ cms.i18n.example.official/example.label }}"></span></template></body></html>',
        );

        expect(() => renderContentTexts(document.body, "en", [source])).toThrow(
            "Server texts are unsupported in span[title]",
        );
    });
});

test("static values stay byte-identical while translations still replace and escape text", () => {
    const { document } = parseHTML(
        '<html><body><p title="Static &amp; quoted">Static &amp; escaped</p><p>{{ cms.i18n.example.official/example.label }}</p><p>{{ state.title }}</p></body></html>',
    );
    const staticNode = document.querySelector("p")!.firstChild;
    const staticHtml = document.querySelector("p")!.outerHTML;
    renderContentTexts(document.body, "en", [
        { namespace: source.namespace, resolve: () => ({ label: '<img src=x onerror="bad()">' }) },
    ]);
    expect(document.querySelector("p")!.firstChild).toBe(staticNode);
    expect(document.querySelector("p")!.outerHTML).toBe(staticHtml);
    expect(document.body.innerHTML).toContain('&lt;img src=x onerror="bad()"&gt;');
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.innerHTML).toContain("{{ state.title }}");
});

test("the static fast path does not conceal invalid reserved expressions or inert translations", () => {
    for (const html of [
        "<p>Static {{ cms.invalid }}</p>",
        "<script>Static {{ cms.i18n.example.official/example.label }}</script>",
        '<a href="{{ cms.i18n.example.official/example.label }}">Static</a>',
    ]) {
        const { document } = parseHTML(`<html><body>${html}</body></html>`);
        expect(() => renderContentTexts(document.body, "en", [source])).toThrow();
    }
});
