import { describe, expect, test } from "bun:test";
import { renderContentTexts } from "@bernouy/cms-content/rendering";
import { parseHTML } from "linkedom";

const source = {
    namespace: "example",
    resolve: () => ({ label: "Translated label" }),
};

describe("renderContentTexts", () => {
    test("renders user-facing attributes on raw-text and embedded elements", () => {
        const { document } = parseHTML(
            '<html><body><textarea placeholder="{{ cms.i18n.example.label }}"></textarea>' +
                '<iframe title="{{ cms.i18n.example.label }}"></iframe></body></html>',
        );

        renderContentTexts(document.body, "en", [source]);

        expect(document.querySelector("textarea")?.getAttribute("placeholder")).toBe("Translated label");
        expect(document.querySelector("iframe")?.getAttribute("title")).toBe("Translated label");
    });

    test("still rejects server texts inside inert content", () => {
        const { document } = parseHTML(
            '<html><body><template><span title="{{ cms.i18n.example.label }}"></span></template></body></html>',
        );

        expect(() => renderContentTexts(document.body, "en", [source])).toThrow(
            "Server texts are unsupported in span[title]",
        );
    });
});
