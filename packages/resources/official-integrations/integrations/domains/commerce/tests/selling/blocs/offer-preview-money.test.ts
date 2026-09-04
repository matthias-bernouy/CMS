import { describe, expect, test } from "bun:test";
import {
    clearResponsiveSourceImageElement,
    syncResponsiveSourceImageElement,
} from "@bernouy/cms-source-images/browser";
import {
    formatMoney,
    parseBooleanAttribute,
} from "@bernouy/cms-official-integrations/integrations/ulvia/blocs/domains/commerce/commerce-offer-preview/money.ts";

describe("Commerce offer preview money", () => {
    test("omits insignificant decimals from whole amounts", () => {
        expect(formatMoney(11_000, "eur", "fr-FR", false)).toBe("110 €");
    });

    test("keeps real decimals when fractional prices are enabled", () => {
        expect(formatMoney(11_050, "eur", "fr-FR", false)).toBe("110,50 €");
    });

    test("rejects an inconsistent fractional amount when whole units are required", () => {
        expect(formatMoney(11_050, "eur", "fr-FR", true)).toBe("");
        expect(formatMoney(11_000, "eur", "fr-FR", true)).toBe("110 €");
    });

    test("does not treat the bound false string as a present boolean attribute", () => {
        expect(parseBooleanAttribute("true")).toBeTrue();
        expect(parseBooleanAttribute("false")).toBeFalse();
        expect(parseBooleanAttribute(null)).toBeFalse();
    });
});

describe("Commerce offer preview responsive media", () => {
    test("does not activate unresolved Source bindings", () => {
        const image = offerImage({ src: "{{ unresolved }}", width: "{{ width }}", height: "{{ height }}" });

        expect(syncResponsiveSourceImageElement(image)).toBe(false);
        expect(image.hasAttribute("src")).toBe(false);
        expect(image.hasAttribute("srcset")).toBe(false);
    });

    test("uses the immutable original while historical dimensions are unknown", () => {
        const image = offerImage({ src: "/.cms/sources/commerce/publicOfferImage?id=9" });

        expect(syncResponsiveSourceImageElement(image)).toBe(false);
        expect(image.getAttribute("src")).toBe("/.cms/sources/commerce/publicOfferImage?id=9");
        expect(image.hasAttribute("srcset")).toBe(false);
    });

    test("emits truthful bounded candidates and lazy auto-sizes in safe order", () => {
        const image = offerImage({
            src: "/.cms/sources/commerce/publicOfferImage?id=9",
            width: "900",
            height: "600",
        });

        expect(syncResponsiveSourceImageElement(image)).toBe(true);
        expect(image.getAttribute("width")).toBe("900");
        expect(image.getAttribute("height")).toBe("600");
        expect(image.getAttribute("sizes")).toBe("auto, 100vw");
        expect(image.getAttribute("srcset")).toContain("cms-width=768 768w");
        expect(image.getAttribute("srcset")).not.toContain("1024w");
        expect(image.getAttribute("src")).toBe("/.cms/sources/commerce/publicOfferImage?id=9");
        expect(image.changes.slice(-5)).toEqual(["width", "height", "sizes", "srcset", "src"]);
    });

    test("preserves authored sizes and never adds auto to eager images", () => {
        const authored = offerImage({
            src: "/image?id=9",
            width: "1600",
            height: "1200",
            sizes: "(min-width: 60rem) 30vw, 100vw",
            loading: "eager",
        });
        const eager = offerImage({ src: "/image?id=10", width: "1600", height: "1200", loading: "eager" });

        syncResponsiveSourceImageElement(authored);
        syncResponsiveSourceImageElement(eager);

        expect(authored.getAttribute("sizes")).toBe("(min-width: 60rem) 30vw, 100vw");
        expect(eager.getAttribute("sizes")).toBe("100vw");
    });

    test("clears only generated attributes when a node is recycled", () => {
        const image = offerImage({ src: "/image?id=9", width: "900", height: "600", sizes: "40vw" });
        syncResponsiveSourceImageElement(image);
        image.setAttribute("data-src", "{{ next }}");

        expect(syncResponsiveSourceImageElement(image)).toBe(false);
        expect(image.getAttribute("sizes")).toBe("40vw");
        expect(image.hasAttribute("src")).toBe(false);
        expect(image.hasAttribute("srcset")).toBe(false);

        clearResponsiveSourceImageElement(image);
        expect(image.getAttribute("sizes")).toBe("40vw");
    });
});

type FakeImage = HTMLImageElement & { changes: string[] };

function offerImage(options: {
    src: string;
    width?: string;
    height?: string;
    sizes?: string;
    loading?: "lazy" | "eager";
}): FakeImage {
    const attributes = new Map<string, string>();
    const changes: string[] = [];
    const image = {
        changes,
        getAttribute(name: string) {
            return attributes.get(name) ?? null;
        },
        hasAttribute(name: string) {
            return attributes.has(name);
        },
        setAttribute(name: string, value: string) {
            attributes.set(name, String(value));
            changes.push(name);
        },
        removeAttribute(name: string) {
            attributes.delete(name);
            changes.push(name);
        },
    } as unknown as FakeImage;
    image.setAttribute("data-src", options.src);
    if (options.width) {
        image.setAttribute("data-source-width", options.width);
    }
    if (options.height) {
        image.setAttribute("data-source-height", options.height);
    }
    if (options.sizes) {
        image.setAttribute("sizes", options.sizes);
    }
    image.setAttribute("loading", options.loading ?? "lazy");
    image.changes.length = 0;
    return image;
}
