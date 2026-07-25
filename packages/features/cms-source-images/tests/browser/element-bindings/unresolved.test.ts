import { describe, expect, test } from "bun:test";
import { syncResponsiveSourceImageElement } from "@bernouy/cms-source-images/browser";
import { image } from "./fixture";

describe("unresolved responsive Source image bindings", () => {
    test("does not activate an unresolved binding", () => {
        const element = image({ "data-src": "{{ image.url }}", src: "{{ image.url }}" });

        expect(syncResponsiveSourceImageElement(element)).toBe(false);
        expect(element.hasAttribute("src")).toBe(false);
        expect(element.hasAttribute("srcset")).toBe(false);
    });

    test.each([
        ["width", { "data-source-width": "{{ image.width }}", "data-source-height": "600" }],
        ["height", { "data-source-width": "900", "data-source-height": "{{ image.height }}" }],
        ["partial dimensions", { "data-source-width": "900" }],
        ["partially empty dimensions", { "data-source-width": "", "data-source-height": "600" }],
        ["invalid dimensions", { "data-source-width": "900", "data-source-height": "invalid" }],
    ])("does not fetch while %s is unresolved", (_label, dimensions) => {
        const element = image({
            "data-src": "/.cms/sources/catalog/image?id=7",
            ...dimensions,
        });

        expect(syncResponsiveSourceImageElement(element)).toBe(false);
        expect(element.hasAttribute("src")).toBe(false);
        expect(element.hasAttribute("srcset")).toBe(false);
    });

    test("does not fetch while authored sizes is unresolved", () => {
        const element = image({
            "data-src": "/.cms/sources/catalog/image?id=7",
            "data-source-width": "900",
            "data-source-height": "600",
            sizes: "{{ layout.imageSizes }}",
        });

        expect(syncResponsiveSourceImageElement(element)).toBe(false);
        expect(element.hasAttribute("src")).toBe(false);
        expect(element.hasAttribute("srcset")).toBe(false);

        element.setAttribute("sizes", "(min-width: 60rem) 30vw, 100vw");
        expect(syncResponsiveSourceImageElement(element)).toBe(true);
        expect(element.getAttribute("sizes")).toBe("(min-width: 60rem) 30vw, 100vw");
    });

    test.each([null, "{{ image.url }}"])(
        "preserves network attributes changed by another owner when data-src becomes %s",
        (dataSrc) => {
            const element = image({
                "data-src": "/.cms/sources/catalog/image?id=7",
                "data-source-width": "900",
                "data-source-height": "600",
            });
            expect(syncResponsiveSourceImageElement(element)).toBe(true);
            element.setAttribute("src", "/other-owner-original");
            element.setAttribute("srcset", "/other-owner-candidate 900w");
            if (dataSrc === null) {
                element.removeAttribute("data-src");
            } else {
                element.setAttribute("data-src", dataSrc);
            }

            expect(syncResponsiveSourceImageElement(element)).toBe(false);
            expect(element.getAttribute("src")).toBe("/other-owner-original");
            expect(element.getAttribute("srcset")).toBe("/other-owner-candidate 900w");
        },
    );
});
