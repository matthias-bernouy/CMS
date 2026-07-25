import { describe, expect, test } from "bun:test";
import { createRoot, image, install, settle } from "./fixture";

describe("bound image runtime lifecycle", () => {
    test("batches added and synchronously updated bindings", async () => {
        const root = createRoot();
        const runtime = install(root);
        const element = image({ "data-cms-src": "{{ image.url }}" });
        root.append(element);
        element.setAttribute("data-cms-src", "/.cms/sources/catalog/image?id=7");
        element.setAttribute("data-source-width", "900");
        element.setAttribute("data-source-height", "600");

        await settle();

        expect(element.getAttribute("srcset")).toContain("cms-width=768 768w");
        expect(element.getAttribute("src")).toBe("/.cms/sources/catalog/image?id=7");
        runtime.disconnect();
    });

    test("keeps empty and unresolved bindings network-dark", async () => {
        const root = createRoot();
        const unresolved = image({
            "data-cms-src": "{{ image.url }}",
            src: "{{ image.url }}",
            srcset: "",
        });
        const empty = image({ "data-cms-src": "" });
        root.append(unresolved, empty);
        const runtime = install(root);

        await settle();

        for (const element of [unresolved, empty]) {
            expect(element.hasAttribute("src")).toBe(false);
            expect(element.hasAttribute("srcset")).toBe(false);
        }
        runtime.disconnect();
    });

    test("activates a complete picture group only after every dynamic value resolves", async () => {
        const root = createRoot();
        const picture = document.createElement("picture");
        const source = document.createElement("source");
        const fallback = image({
            "data-cms-network-inert": "",
            "data-cms-src": "/assets/fallback.jpg",
            "data-cms-width": "640",
            "data-cms-height": "480",
            "data-cms-sizes": "100vw",
        });
        picture.setAttribute("data-cms-network-inert", "");
        source.setAttribute("data-cms-network-inert", "");
        source.setAttribute("data-cms-media", "(min-width: 60rem)");
        source.setAttribute("data-cms-srcset", "{{ image.largeSrcset }}");
        picture.append(source, fallback);
        root.append(picture);
        const runtime = install(root);
        await settle();

        expect(source.hasAttribute("srcset")).toBe(false);
        expect(fallback.hasAttribute("src")).toBe(false);

        const order: string[] = [];
        const observer = new MutationObserver((records) => {
            for (const record of records) {
                order.push(`${(record.target as Element).localName}:${record.attributeName}`);
            }
        });
        observer.observe(picture, { attributes: true, subtree: true });
        source.setAttribute("data-cms-srcset", "/large.webp 1280w");
        await settle();

        expect(source.getAttribute("media")).toBe("(min-width: 60rem)");
        expect(source.getAttribute("srcset")).toBe("/large.webp 1280w");
        expect(fallback.getAttribute("width")).toBe("640");
        expect(fallback.getAttribute("height")).toBe("480");
        expect(fallback.getAttribute("sizes")).toBe("100vw");
        expect(fallback.getAttribute("src")).toBe("/assets/fallback.jpg");
        expect(order.filter((entry) => !entry.startsWith("source:data-cms"))).toEqual([
            "img:width",
            "img:height",
            "source:media",
            "img:sizes",
            "source:srcset",
            "img:src",
        ]);
        observer.disconnect();
        runtime.disconnect();
    });

    test("clears stale attributes as a node is recycled", async () => {
        const root = createRoot();
        const element = image({
            "data-cms-src": "/.cms/sources/catalog/image?id=7",
            "data-source-width": "900",
            "data-source-height": "600",
            loading: "lazy",
        });
        root.append(element);
        const runtime = install(root);
        await settle();

        element.setAttribute("data-cms-src", "/assets/fallback.jpg?cms-width=128");
        await settle();
        expect(element.getAttribute("src")).toBe("/assets/fallback.jpg");
        expect(element.hasAttribute("srcset")).toBe(false);
        expect(element.hasAttribute("sizes")).toBe(false);

        element.setAttribute("data-cms-src", "");
        await settle();
        expect(element.hasAttribute("src")).toBe(false);
        expect(element.hasAttribute("srcset")).toBe(false);
        runtime.disconnect();
    });
});
