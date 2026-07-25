import { describe, expect, test } from "bun:test";
import {
    clearResponsiveSourceImageElement,
    syncResponsiveSourceImageElement,
} from "@bernouy/cms-source-images/browser";
import { image } from "./fixture";

describe("responsive Source image element lifecycle", () => {
    test("serves an original-only historical row and upgrades it once dimensions resolve", () => {
        const element = image({
            "data-src": "/.cms/sources/catalog/image?id=7",
            loading: "lazy",
        });

        expect(syncResponsiveSourceImageElement(element)).toBe(false);
        expect(element.getAttribute("src")).toBe("/.cms/sources/catalog/image?id=7");

        element.setAttribute("data-source-width", "900");
        element.setAttribute("data-source-height", "600");
        element.mutations.length = 0;

        expect(syncResponsiveSourceImageElement(element)).toBe(true);
        expect(element.getAttribute("sizes")).toBe("auto, 100vw");
        expect(element.getAttribute("srcset")).toContain("cms-width=768 768w");
        expect(element.mutations.slice(-5)).toEqual(["set:width", "set:height", "set:sizes", "set:srcset", "set:src"]);
    });

    test("treats explicit historical null dimensions as original-only", () => {
        const element = image({
            "data-src": "/.cms/sources/catalog/image?id=7&cms-width=768",
            "data-source-width": "null",
            "data-source-height": "null",
        });

        expect(syncResponsiveSourceImageElement(element)).toBe(false);
        expect(element.getAttribute("src")).toBe("/.cms/sources/catalog/image?id=7");
        expect(element.hasAttribute("srcset")).toBe(false);
    });

    test.each([true, false])(
        "treats a pair rendered empty by bindings as historical while rollout enabled=%s",
        (enabled) => {
            const element = image({
                "data-src": "/.cms/sources/catalog/image?id=7&cms-width=768",
                "data-source-width": "",
                "data-source-height": "",
            });

            expect(syncResponsiveSourceImageElement(element, enabled)).toBe(false);
            expect(element.getAttribute("src")).toBe("/.cms/sources/catalog/image?id=7");
            expect(element.hasAttribute("srcset")).toBe(false);
        },
    );

    test("does not detach and reattach an unchanged historical fallback", () => {
        const element = image({
            "data-src": "/.cms/sources/catalog/image?id=7",
        });
        expect(syncResponsiveSourceImageElement(element)).toBe(false);
        element.mutations.length = 0;

        expect(syncResponsiveSourceImageElement(element)).toBe(false);
        expect(element.mutations).toEqual([]);
        expect(element.getAttribute("src")).toBe("/.cms/sources/catalog/image?id=7");
    });

    test("preserves authored sizes and clears only generated network attributes", () => {
        const element = image({
            "data-src": "/image?id=8",
            "data-source-width": "1024",
            "data-source-height": "768",
            loading: "eager",
            sizes: "(min-width: 60rem) 30vw, 100vw",
        });

        expect(syncResponsiveSourceImageElement(element)).toBe(true);
        expect(element.getAttribute("sizes")).toBe("(min-width: 60rem) 30vw, 100vw");

        clearResponsiveSourceImageElement(element);
        expect(element.getAttribute("sizes")).toBe("(min-width: 60rem) 30vw, 100vw");
        expect(element.hasAttribute("src")).toBe(false);
        expect(element.hasAttribute("srcset")).toBe(false);
    });

    test("treats an omitted loading attribute as eager and never emits auto-sizes", () => {
        const element = image({
            "data-src": "/image?id=8",
            "data-source-width": "1024",
            "data-source-height": "768",
        });

        expect(syncResponsiveSourceImageElement(element)).toBe(true);
        expect(element.getAttribute("sizes")).toBe("100vw");
        expect(element.getAttribute("sizes")).not.toContain("auto");
    });

    test("clears generated attributes when a recycled element loses data-src", () => {
        const element = image({
            "data-src": "/image?id=9",
            "data-source-width": "1024",
            "data-source-height": "768",
            loading: "lazy",
        });
        expect(syncResponsiveSourceImageElement(element)).toBe(true);

        element.removeAttribute("data-src");
        expect(syncResponsiveSourceImageElement(element)).toBe(false);

        for (const name of ["src", "srcset", "sizes", "width", "height"]) {
            expect(element.hasAttribute(name)).toBe(false);
        }
    });
});
