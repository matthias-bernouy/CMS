import { describe, expect, test } from "bun:test";
import {
    applyResponsiveSourceImageAttributes,
    clearResponsiveSourceImageAttributes,
    type ResponsiveSourceImageInput,
} from "@bernouy/cms-source-images/browser";

class FakeImage {
    readonly attributes = new Map<string, string>();
    readonly mutations: string[] = [];

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
        this.mutations.push(`set:${name}`);
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
        this.mutations.push(`remove:${name}`);
    }
}

const input: ResponsiveSourceImageInput = {
    baseUrl: "/image?id=42",
    sourceWidth: 800,
    sourceHeight: 600,
    loading: "lazy",
};

function image(): HTMLImageElement & FakeImage {
    return new FakeImage() as unknown as HTMLImageElement & FakeImage;
}

describe("responsive Source image DOM activation", () => {
    test("activates dimensions, sizes, srcset, then src", () => {
        const element = image();
        expect(applyResponsiveSourceImageAttributes(element, input)).toBe(true);
        expect(element.mutations).toEqual(["set:width", "set:height", "set:sizes", "set:srcset", "set:src"]);
        expect(element.getAttribute("width")).toBe("800");
        expect(element.getAttribute("height")).toBe("600");
    });

    test("activates no network attribute for unresolved bindings", () => {
        const element = image();
        element.setAttribute("src", "{{ offer.imageUrl }}");
        element.setAttribute("srcset", "");
        element.mutations.length = 0;
        expect(applyResponsiveSourceImageAttributes(element, { ...input, baseUrl: "{{ offer.imageUrl }}" })).toBe(
            false,
        );
        expect(element.hasAttribute("src")).toBe(false);
        expect(element.hasAttribute("srcset")).toBe(false);
        expect(element.mutations).toEqual(["remove:src", "remove:srcset"]);
    });

    test("clears generated values but preserves authored equal values", () => {
        const element = image();
        element.setAttribute("sizes", "auto, 100vw");
        element.mutations.length = 0;
        applyResponsiveSourceImageAttributes(element, input);
        clearResponsiveSourceImageAttributes(element);
        expect(element.getAttribute("sizes")).toBe("auto, 100vw");
        expect(element.hasAttribute("width")).toBe(false);
        expect(element.hasAttribute("height")).toBe(false);
        expect(element.hasAttribute("srcset")).toBe(false);
        expect(element.hasAttribute("src")).toBe(false);
    });

    test("restores safe authored values that were temporarily replaced", () => {
        const element = image();
        element.setAttribute("src", "/authored-original");
        element.setAttribute("width", "10");
        applyResponsiveSourceImageAttributes(element, input);
        clearResponsiveSourceImageAttributes(element);
        expect(element.getAttribute("src")).toBe("/authored-original");
        expect(element.getAttribute("width")).toBe("10");
    });

    test("does not erase an attribute changed by another owner", () => {
        const element = image();
        applyResponsiveSourceImageAttributes(element, input);
        element.setAttribute("srcset", "/authored 100w");
        clearResponsiveSourceImageAttributes(element);
        expect(element.getAttribute("srcset")).toBe("/authored 100w");
        expect(element.hasAttribute("src")).toBe(false);
    });

    test("recycles a node without retaining stale generated candidates", () => {
        const element = image();
        applyResponsiveSourceImageAttributes(element, input);
        const oldSrcset = element.getAttribute("srcset");
        applyResponsiveSourceImageAttributes(element, {
            ...input,
            baseUrl: "/other?id=7",
            sourceWidth: 128,
            sourceHeight: 128,
        });
        expect(element.getAttribute("src")).toBe("/other?id=7");
        expect(element.getAttribute("srcset")).not.toBe(oldSrcset);
        expect(element.getAttribute("srcset")).toContain("128w");
        expect(element.getAttribute("srcset")).not.toContain("256w");
    });

    test("removes stale srcset when the recycled source is below the first rung", () => {
        const element = image();
        applyResponsiveSourceImageAttributes(element, input);
        applyResponsiveSourceImageAttributes(element, {
            ...input,
            baseUrl: "/tiny",
            sourceWidth: 40,
            sourceHeight: 20,
        });
        expect(element.hasAttribute("srcset")).toBe(false);
        expect(element.getAttribute("src")).toBe("/tiny");
    });

    test("clearing twice is idempotent", () => {
        const element = image();
        applyResponsiveSourceImageAttributes(element, input);
        clearResponsiveSourceImageAttributes(element);
        const afterFirst = [...element.attributes];
        clearResponsiveSourceImageAttributes(element);
        expect([...element.attributes]).toEqual(afterFirst);
    });
});
