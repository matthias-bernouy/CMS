import { describe, expect, test } from "bun:test";
import editorComponentGet from "cms-control/api/editor/component.js.get";

describe("editor component runtime endpoint", () => {
    test.each([
        ["dark", false, false],
        ["public only", true, false],
        ["private only", false, true],
        ["fully enabled", true, true],
    ] as const)(
        "serves the shared component runtime with responsive markup %s",
        async (_label, publicEnabled, privateEnabled) => {
            const cache = new Map<string, unknown>();
            const cms = {
                config: {
                    responsivePublicSourceImagesEnabled: publicEnabled,
                    responsivePrivateSourceImagesEnabled: privateEnabled,
                    sourceImageInterceptor: async (
                        _endpoint: unknown,
                        request: Request,
                        next: (forwarded: Request) => Promise<Response>,
                    ) => next(request),
                },
                cache: {
                    get: (key: string) => cache.get(key) ?? null,
                    set: (key: string, value: unknown) => {
                        cache.set(key, value);
                    },
                },
            };

            const response = await editorComponentGet(
                new Request("http://localhost/cms/api/editor/component.js"),
                cms as any,
            );
            const js = await response.text();

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("text/javascript");
            expect(js).toContain("window.p9r");
            expect(js).toContain("Component");
            expect(js).toContain("Composition");
            expect(js).toContain("syncResponsiveSourceImageElement");
            expect(js).toContain("cms-width");
            expect(js).not.toContain(`define("base-container"`);
            expect(js).not.toContain(`define("base-card"`);

            (window as any).p9r = {};
            window.eval(js);
            expect((window as any).p9r.SOURCE_IMAGE_WIDTHS).toEqual([
                64, 128, 256, 384, 512, 768, 1_024, 1_280, 1_600, 1_920, 2_560,
            ]);
            expect((window as any).p9r.createResponsiveSourceImageBrowserApi).toBeUndefined();
            const publicImage = sourceImage("public");
            const privateImage = sourceImage();

            expect((window as any).p9r.syncResponsiveSourceImageElement(publicImage)).toBe(publicEnabled);
            expect((window as any).p9r.syncResponsiveSourceImageElement(privateImage)).toBe(privateEnabled);
            expect(publicImage.hasAttribute("srcset")).toBe(publicEnabled);
            expect(privateImage.hasAttribute("srcset")).toBe(privateEnabled);
        },
    );

    test("never treats an arbitrary editor query version as immutable", async () => {
        const cms = {
            config: {
                responsivePublicSourceImagesEnabled: true,
                responsivePrivateSourceImagesEnabled: true,
                sourceImageInterceptor: async (
                    _endpoint: unknown,
                    request: Request,
                    next: (forwarded: Request) => Promise<Response>,
                ) => next(request),
            },
            cache: {
                get: () => null,
                set: () => undefined,
            },
        };
        const response = await editorComponentGet(
            new Request("http://localhost/cms/api/editor/component.js?v=arbitrary"),
            cms as any,
        );
        expect(response.headers.get("cache-control")).toBe("no-cache, must-revalidate");
    });

    test("enables both responsive cohorts when an interceptor is configured without overrides", async () => {
        const cms = {
            config: {
                sourceImageInterceptor: async (
                    _endpoint: unknown,
                    request: Request,
                    next: (forwarded: Request) => Promise<Response>,
                ) => next(request),
            },
            cache: {
                get: () => null,
                set: () => undefined,
            },
        };
        const response = await editorComponentGet(
            new Request("http://localhost/cms/api/editor/component.js"),
            cms as any,
        );
        (window as any).p9r = {};
        window.eval(await response.text());

        expect((window as any).p9r.syncResponsiveSourceImageElement(sourceImage("public"))).toBe(true);
        expect((window as any).p9r.syncResponsiveSourceImageElement(sourceImage())).toBe(true);
    });

    test("keeps responsive markup dark without a matching Source interceptor", async () => {
        const cms = {
            config: {
                responsivePublicSourceImagesEnabled: true,
                responsivePrivateSourceImagesEnabled: true,
            },
            cache: {
                get: () => null,
                set: () => undefined,
            },
        };
        const response = await editorComponentGet(
            new Request("http://localhost/cms/api/editor/component.js"),
            cms as any,
        );
        (window as any).p9r = {};
        window.eval(await response.text());
        const image = document.createElement("img");
        image.setAttribute("data-src", "/image?id=7");
        image.setAttribute("data-source-width", "800");
        image.setAttribute("data-source-height", "600");

        expect((window as any).p9r.syncResponsiveSourceImageElement(image)).toBe(false);
        expect(image.hasAttribute("srcset")).toBe(false);
    });
});

function sourceImage(access?: "public"): HTMLImageElement {
    const image = document.createElement("img");
    image.setAttribute("data-src", "/.cms/sources/catalog/image?id=7");
    image.setAttribute("data-source-width", "800");
    image.setAttribute("data-source-height", "600");
    image.setAttribute("loading", "lazy");
    if (access) {
        image.setAttribute("data-source-image-access", access);
    }
    return image;
}
