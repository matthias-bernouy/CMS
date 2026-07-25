import { describe, expect, test } from "bun:test";
import { createResponsiveSourceImageBrowserApi } from "@bernouy/cms-source-images/browser-host";

class FakeImage {
    readonly attributes = new Map<string, string>();

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
    }
}

function image(attributes: Record<string, string>): HTMLImageElement & FakeImage {
    const element = new FakeImage();
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
    }
    return element as unknown as HTMLImageElement & FakeImage;
}

describe("responsive Source image browser rollout", () => {
    test("switches generated candidates off and restores the immutable original URL", () => {
        const element = image({
            "data-src": "/.cms/sources/commerce/image?id=42&cms-width=999#media",
            "data-source-width": "1200",
            "data-source-height": "800",
            loading: "lazy",
        });
        const enabled = createResponsiveSourceImageBrowserApi({ public: true, private: true });
        const disabled = createResponsiveSourceImageBrowserApi({ public: false, private: false });

        expect(enabled.syncResponsiveSourceImageElement(element)).toBe(true);
        expect(element.getAttribute("srcset")).toContain("cms-width=1024");

        expect(disabled.syncResponsiveSourceImageElement(element)).toBe(false);
        expect(element.getAttribute("src")).toBe("/.cms/sources/commerce/image?id=42#media");
        expect(element.hasAttribute("srcset")).toBe(false);
        expect(element.hasAttribute("sizes")).toBe(false);
        expect(element.hasAttribute("width")).toBe(false);
        expect(element.hasAttribute("height")).toBe(false);

        expect(enabled.syncResponsiveSourceImageElement(element)).toBe(true);
        expect(element.getAttribute("srcset")).toContain("cms-width=1024");
    });

    test("keeps every exposed activation path dark while disabled", () => {
        const disabled = createResponsiveSourceImageBrowserApi({ public: false, private: false });
        const element = image({});
        const input = {
            baseUrl: "/image?id=7&cms-width=512",
            sourceWidth: 800,
            sourceHeight: 600,
            loading: "lazy" as const,
        };

        expect(disabled.buildResponsiveSourceImageAttributes(input)).toBeNull();
        expect(disabled.applyResponsiveSourceImageAttributes(element, input)).toBe(false);
        expect(element.getAttribute("src")).toBe("/image?id=7");
        expect(element.hasAttribute("srcset")).toBe(false);
    });

    test("does not overwrite a src changed by another owner during rollback", () => {
        const element = image({});
        const input = {
            baseUrl: "/image?id=7",
            sourceWidth: 800,
            sourceHeight: 600,
            loading: "lazy" as const,
        };
        const enabled = createResponsiveSourceImageBrowserApi({ public: true, private: true });
        const disabled = createResponsiveSourceImageBrowserApi({ public: false, private: false });

        expect(enabled.applyResponsiveSourceImageAttributes(element, input)).toBe(true);
        element.setAttribute("src", "/owned-by-another-renderer");
        expect(disabled.applyResponsiveSourceImageAttributes(element, input)).toBe(false);

        expect(element.getAttribute("src")).toBe("/owned-by-another-renderer");
        expect(element.hasAttribute("srcset")).toBe(false);
    });

    test("does not load an original while disabled bindings are unresolved", () => {
        const disabled = createResponsiveSourceImageBrowserApi({ public: false, private: false });
        const element = image({
            "data-src": "/image?id=7",
            "data-source-width": "{{ image.width }}",
            "data-source-height": "{{ image.height }}",
            sizes: "{{ layout.imageSizes }}",
        });

        expect(disabled.syncResponsiveSourceImageElement(element)).toBe(false);
        expect(element.hasAttribute("src")).toBe(false);
        expect(element.hasAttribute("srcset")).toBe(false);
    });

    test("requires public opt-in and classifies missing or unknown access as private", () => {
        const publicOnly = createResponsiveSourceImageBrowserApi({ public: true, private: false });
        const privateOnly = createResponsiveSourceImageBrowserApi({ public: false, private: true });
        const explicitPublic = image({
            "data-src": "/image?id=public",
            "data-source-width": "800",
            "data-source-height": "600",
            "data-source-image-access": "public",
        });
        const defaultPrivate = image({
            "data-src": "/image?id=private",
            "data-source-width": "800",
            "data-source-height": "600",
        });
        const unknownPrivate = image({
            "data-src": "/image?id=unknown",
            "data-source-width": "800",
            "data-source-height": "600",
            "data-source-image-access": "typo",
        });

        expect(publicOnly.syncResponsiveSourceImageElement(explicitPublic)).toBe(true);
        expect(publicOnly.syncResponsiveSourceImageElement(defaultPrivate)).toBe(false);
        expect(publicOnly.syncResponsiveSourceImageElement(unknownPrivate)).toBe(false);

        expect(privateOnly.syncResponsiveSourceImageElement(explicitPublic)).toBe(false);
        expect(privateOnly.syncResponsiveSourceImageElement(defaultPrivate)).toBe(true);
        expect(privateOnly.syncResponsiveSourceImageElement(unknownPrivate)).toBe(true);
    });
});
