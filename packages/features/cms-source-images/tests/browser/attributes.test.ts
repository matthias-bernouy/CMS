import { describe, expect, test } from "bun:test";
import { buildResponsiveSourceImageAttributes, SOURCE_IMAGE_WIDTHS } from "@bernouy/cms-source-images/browser";

describe("responsive Source image attributes", () => {
    test("emits only canonical rungs at or below intrinsic width", () => {
        const attributes = buildResponsiveSourceImageAttributes({
            baseUrl: "/.cms/sources/commerce/publicOfferImage?id=42",
            sourceWidth: 1_000,
            sourceHeight: 600,
            loading: "lazy",
        })!;
        const descriptors = attributes
            .srcset!.split(", ")
            .map((candidate) => Number(candidate.split(" ").at(-1)!.slice(0, -1)));
        expect(descriptors).toEqual([64, 128, 256, 384, 512, 768]);
        expect(descriptors.every((width) => SOURCE_IMAGE_WIDTHS.includes(width as never))).toBe(true);
        expect(attributes.srcset).not.toContain("1000w");
        expect(attributes.src).toBe("/.cms/sources/commerce/publicOfferImage?id=42");
    });

    test("makes every width descriptor equal the cms-width URL parameter", () => {
        const attributes = buildResponsiveSourceImageAttributes({
            baseUrl: "https://cms.test/image?id=42",
            sourceWidth: 2_000,
            sourceHeight: 1_000,
            loading: "lazy",
        })!;
        for (const candidate of attributes.srcset!.split(", ")) {
            const [url, descriptor] = candidate.split(" ");
            expect(new URL(url!).searchParams.get("cms-width")).toBe(descriptor!.slice(0, -1));
        }
    });

    test("keeps the original as src fallback and never invents a sub-64 candidate", () => {
        const attributes = buildResponsiveSourceImageAttributes({
            baseUrl: "/tiny.png",
            sourceWidth: 40,
            sourceHeight: 20,
            loading: "lazy",
        })!;
        expect(attributes.src).toBe("/tiny.png");
        expect(attributes.srcset).toBeUndefined();
        expect(attributes.width).toBe(40);
        expect(attributes.height).toBe(20);
    });

    test("preserves an explicit non-empty sizes string exactly", () => {
        const authored = " (min-width: 60rem) 30vw, 100vw ";
        const attributes = buildResponsiveSourceImageAttributes({
            baseUrl: "/image",
            sourceWidth: 800,
            sourceHeight: 600,
            loading: "lazy",
            authoredSizes: authored,
        });
        expect(attributes?.sizes).toBe(authored);
    });

    test("defaults lazy images to auto with a 100vw fallback", () => {
        const attributes = buildResponsiveSourceImageAttributes({
            baseUrl: "/image",
            sourceWidth: 800,
            sourceHeight: 600,
            loading: "lazy",
        });
        expect(attributes?.sizes).toBe("auto, 100vw");
    });

    test("defaults eager images to 100vw and never auto", () => {
        const attributes = buildResponsiveSourceImageAttributes({
            baseUrl: "/image",
            sourceWidth: 800,
            sourceHeight: 600,
            loading: "eager",
        });
        expect(attributes?.sizes).toBe("100vw");
        expect(attributes?.sizes).not.toContain("auto");
    });

    test("preserves existing query/hash and canonicalizes an old width", () => {
        const attributes = buildResponsiveSourceImageAttributes({
            baseUrl: "/image?id=42&CMS-WIDTH=999#preview",
            sourceWidth: 128,
            sourceHeight: 64,
            loading: "eager",
        })!;
        expect(attributes.src).toBe("/image?id=42#preview");
        expect(attributes.srcset).toBe(
            "/image?id=42&cms-width=64#preview 64w, /image?id=42&cms-width=128#preview 128w",
        );
    });

    test.each([
        ["empty URL", { baseUrl: "", sourceWidth: 100, sourceHeight: 100, loading: "lazy" as const }],
        [
            "unresolved URL",
            { baseUrl: "{{ image.url }}", sourceWidth: 100, sourceHeight: 100, loading: "lazy" as const },
        ],
        [
            "unresolved authored sizes",
            {
                baseUrl: "/image",
                sourceWidth: 100,
                sourceHeight: 100,
                loading: "lazy" as const,
                authoredSizes: "{{ layout.imageSizes }}",
            },
        ],
        ["zero width", { baseUrl: "/image", sourceWidth: 0, sourceHeight: 100, loading: "lazy" as const }],
        ["fractional width", { baseUrl: "/image", sourceWidth: 10.5, sourceHeight: 100, loading: "lazy" as const }],
        ["negative height", { baseUrl: "/image", sourceWidth: 100, sourceHeight: -1, loading: "lazy" as const }],
    ])("does not build attributes for %s", (_label, input) => {
        expect(buildResponsiveSourceImageAttributes(input)).toBeNull();
    });

    test("supports the same image contract in narrow and full-width layouts", () => {
        const common = { baseUrl: "/image", sourceWidth: 1_600, sourceHeight: 900, loading: "lazy" as const };
        const narrow = buildResponsiveSourceImageAttributes({
            ...common,
            authoredSizes: "(min-width: 60rem) 30vw, 100vw",
        });
        const wide = buildResponsiveSourceImageAttributes({ ...common, authoredSizes: "100vw" });
        expect(narrow?.srcset).toBe(wide?.srcset);
        expect(narrow?.sizes).toBe("(min-width: 60rem) 30vw, 100vw");
        expect(wide?.sizes).toBe("100vw");
    });
});
